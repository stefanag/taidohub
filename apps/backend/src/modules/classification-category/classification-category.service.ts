import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  type ClassificationCategory,
  type RootCode,
  ROOT_CODES,
  type UpdateClassificationCategoryInput,
} from '@repo/contracts/classification-category';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import {
  ClassificationCategoryRepository,
  type ClassificationCategoryRow,
} from './classification-category.repository.js';

/**
 * Business logic for classification categories.
 *
 * Resolution semantics:
 * - Root rows (the three taxonomy roots from `ROOT_CODES`) are immutable in
 *   structure — code + parent are immutable, only display strings + sort order
 *   change. We keep an in-process `Map<RootCode, row>` cache so the per-request
 *   "what root does this child belong to" lookup is free after the first call.
 * - The cache is lazily populated on first access and invalidated whenever a
 *   mutation touches a root row.
 *
 * Authorisation:
 * - Reads are unrestricted (CASL grants `read` to every authenticated user).
 * - Writes (only `update`) require the actor to be `sysadmin` — the controller's
 *   `@CheckAbility('manage', ...)` decorator handles the HTTP-level rejection,
 *   but the service also checks defensively so internal callers can't bypass.
 */
@Injectable()
export class ClassificationCategoryService {
  private readonly logger = new Logger(ClassificationCategoryService.name);
  private rootCache: Map<RootCode, ClassificationCategoryRow> | null = null;

  constructor(private readonly repo: ClassificationCategoryRepository) {}

  /**
   * Lazily builds the `(rootCode → row)` cache. Subsequent calls return the
   * same Map instance until something invalidates it.
   */
  async getRootMap(): Promise<Map<RootCode, ClassificationCategoryRow>> {
    if (this.rootCache) return this.rootCache;
    const roots = await this.repo.findRoots();
    const next = new Map<RootCode, ClassificationCategoryRow>();
    for (const r of roots) {
      if ((ROOT_CODES as readonly string[]).includes(r.code)) {
        next.set(r.code as RootCode, r);
      }
    }
    this.rootCache = next;
    return next;
  }

  /** Returns every direct child of the requested root, hydrated to the API shape. */
  async listByRoot(
    rootCode: RootCode,
    opts: { includeInactive?: boolean } = {},
  ): Promise<ClassificationCategory[]> {
    const roots = await this.getRootMap();
    const root = roots.get(rootCode);
    if (!root) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Root '${rootCode}' not seeded.` },
      });
    }
    const rows = await this.repo.findChildren(root.id, opts.includeInactive ?? false);
    return rows.map((r) => this.toApi(r, rootCode));
  }

  /**
   * Returns `id → RootCode` for every input id. Unknown ids — including ids
   * whose row's root code is not in `ROOT_CODES` — map to `null`. The
   * `TechniqueService` uses this to enforce its allowed-roots rule without
   * having to re-implement the join.
   */
  async resolveRootCodes(ids: readonly string[]): Promise<Map<string, RootCode | null>> {
    const rows = await this.repo.findManyByIds(ids);
    const roots = await this.getRootMap();
    const idToRoot = new Map<string, ClassificationCategoryRow>();
    for (const r of roots.values()) idToRoot.set(r.id, r);

    const out = new Map<string, RootCode | null>();
    for (const id of ids) out.set(id, null);
    for (const r of rows) {
      if (r.parentId === null) {
        // The id points at a root row itself — report its rootCode if known.
        if ((ROOT_CODES as readonly string[]).includes(r.code)) {
          out.set(r.id, r.code as RootCode);
        }
      } else {
        const parent = idToRoot.get(r.parentId);
        if (parent && (ROOT_CODES as readonly string[]).includes(parent.code)) {
          out.set(r.id, parent.code as RootCode);
        }
      }
    }
    return out;
  }

  /**
   * Patch a row. Only `sysadmin` may call this. The root cache is dropped only
   * when the affected row is itself a root — child updates don't change the
   * `(rootCode → root row)` map.
   */
  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateClassificationCategoryInput,
  ): Promise<ClassificationCategory> {
    if (actor.role !== 'sysadmin') {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Only sysadmins may edit classification categories.',
        },
      });
    }
    // Copy only present keys so `exactOptionalPropertyTypes` is honoured —
    // an absent key must never be written as `undefined`.
    const patch: Parameters<typeof this.repo.update>[1] = {};
    if ('nameEn' in input && input.nameEn !== undefined) patch.nameEn = input.nameEn;
    if ('nameSv' in input && input.nameSv !== undefined) patch.nameSv = input.nameSv;
    if ('nameFi' in input && input.nameFi !== undefined) patch.nameFi = input.nameFi;
    if ('nameJa' in input && input.nameJa !== undefined) patch.nameJa = input.nameJa;
    if ('sortOrder' in input && input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if ('isActive' in input && input.isActive !== undefined) patch.isActive = input.isActive;
    const row = await this.repo.update(id, patch);
    if (row.parentId === null) this.rootCache = null;
    const roots = await this.getRootMap();
    const parent = row.parentId
      ? Array.from(roots.values()).find((r) => r.id === row.parentId) ?? null
      : null;
    const rootCode: RootCode | null = parent
      ? (parent.code as RootCode)
      : (ROOT_CODES as readonly string[]).includes(row.code)
        ? (row.code as RootCode)
        : null;
    return this.toApi(row, rootCode);
  }

  /** DB row → API contract. Pure projection. */
  toApi(row: ClassificationCategoryRow, rootCode: RootCode | null): ClassificationCategory {
    return {
      id: row.id,
      parentId: row.parentId,
      rootCode,
      code: row.code,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      nameJa: row.nameJa,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
  }
}
