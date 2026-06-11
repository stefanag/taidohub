import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClassificationCategory,
  RootCode,
} from '@repo/contracts/classification-category';
import { ROOT_CODES } from '@repo/contracts/classification-category';
import type {
  CreateTechniqueInput,
  Technique,
  UpdateTechniqueInput,
} from '@repo/contracts/techniques';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import {
  ClassificationCategoryRepository,
  type ClassificationCategoryRow,
} from '../classification-category/classification-category.repository.js';
import { ClassificationCategoryService } from '../classification-category/classification-category.service.js';

import { validateCategoryLinks } from './category-guards.js';
import {
  TechniqueRepository,
  type TechniqueRow,
} from './technique.repository.js';

/**
 * Business logic for techniques.
 *
 * Authorisation:
 *   - List/findOne: any authenticated caller (CASL grants `read` on Technique).
 *   - Create: CASL `create` is checked at the controller via decorator. The
 *     service additionally resolves the owning organisation and asserts the
 *     caller is allowed to write into it.
 *   - Update/delete: row-level check via {@link AbilityFactory} — orgadmin's
 *     conditional `manage` rule scopes them to their own org's techniques.
 *
 * Mutations always run inside a Drizzle transaction so the technique row,
 * junction rows, and audit-log row commit (or roll back) together.
 *
 * The `update` path replaces the full classification set when
 * `classificationIds` is supplied (REPLACE semantics — not merge).
 */
@Injectable()
export class TechniqueService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly repo: TechniqueRepository,
    private readonly classifications: ClassificationCategoryService,
    private readonly classificationRepo: ClassificationCategoryRepository,
    private readonly audit: AuditLogService,
    private readonly abilities: AbilityFactory,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────
  async list(
    actor: AuthenticatedUser,
    query: {
      classificationIds: string[];
      includeInactive: boolean;
      organisationId: string | null;
      strict: boolean;
    },
  ): Promise<Technique[]> {
    void actor;
    // Lenient mode: unknown ids drop out of the EXISTS group and are ignored.
    // Strict mode: unknown ids surface a 400.
    const idsByRoot = new Map<RootCode, string[]>();
    if (query.classificationIds.length > 0) {
      const resolved = await this.classifications.resolveRootCodes(
        query.classificationIds,
      );
      const unknown: string[] = [];
      for (const id of query.classificationIds) {
        const root = resolved.get(id);
        if (root === null || root === undefined) {
          unknown.push(id);
          continue;
        }
        const bucket = idsByRoot.get(root) ?? [];
        bucket.push(id);
        idsByRoot.set(root, bucket);
      }
      if (query.strict && unknown.length > 0) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_CATEGORY',
            message: `Unknown classification ids in strict mode.`,
            details: { offendingIds: unknown },
          },
        });
      }
    }

    const rows = await this.repo.list({
      classificationIdsByRoot: idsByRoot,
      includeInactive: query.includeInactive,
      organisationId: query.organisationId,
    });
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<Technique> {
    void actor;
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Technique ${id} not found.` },
      });
    }
    return this.hydrate(row);
  }

  // ── Mutations ────────────────────────────────────────────────────────
  async create(actor: AuthenticatedUser, input: CreateTechniqueInput): Promise<Technique> {
    await validateCategoryLinks(this.classifications, {
      classificationIds: input.classificationIds,
      kind: 'technique',
    });

    const organisationId = this.resolveOwningOrg(actor, input.organisationId ?? undefined);

    const inserted = await this.db.transaction(async (tx) => {
      const id = await this.repo.createWithLinks(
        {
          createdByOrganisationId: organisationId,
          createdByUserId: actor.id,
          isKihon: input.isKihon ?? false,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
          minRankId: input.minRankId ?? null,
          nameJa: input.nameJa ?? '',
          nameRomaji: input.nameRomaji,
          nameSv: input.nameSv ?? '',
          nameEn: input.nameEn ?? '',
          nameFi: input.nameFi ?? '',
          descriptionSv: input.descriptionSv ?? '',
          descriptionEn: input.descriptionEn ?? '',
          descriptionFi: input.descriptionFi ?? '',
          classificationIds: input.classificationIds,
        },
        tx,
      );
      const row = await this.repo.findById(id, tx);
      if (!row) throw new Error('technique row vanished after insert');
      await this.audit.record({
        tx,
        entityType: 'technique',
        entityId: id,
        action: 'create',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        before: null,
        after: this.snapshot(row, input.classificationIds),
      });
      return row;
    });

    return this.hydrate(inserted);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateTechniqueInput,
  ): Promise<Technique> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Technique ${id} not found.` },
      });
    }
    this.assertCanManage(actor, existing);

    if (input.classificationIds !== undefined) {
      // Replace-semantics: validate the final set BEFORE touching the DB.
      await validateCategoryLinks(this.classifications, {
        classificationIds: input.classificationIds,
        kind: 'technique',
      });
    }

    const beforeLinks = await this.repo.listClassifications(id);
    const beforeSnapshot = this.snapshot(
      existing,
      beforeLinks.map((l) => l.classificationCategoryId),
    );

    const updated = await this.db.transaction(async (tx) => {
      const patch = this.buildPatch(input);
      const row =
        Object.keys(patch).length > 0
          ? await this.repo.update(id, patch, tx)
          : existing;

      if (input.classificationIds !== undefined) {
        await this.repo.replaceClassifications(id, input.classificationIds, tx);
      }

      const finalLinks = await this.repo.listClassifications(id, tx);
      await this.audit.record({
        tx,
        entityType: 'technique',
        entityId: id,
        action: 'update',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        before: beforeSnapshot,
        after: this.snapshot(
          row,
          finalLinks.map((l) => l.classificationCategoryId),
        ),
      });
      return row;
    });

    return this.hydrate(updated);
  }

  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Technique ${id} not found.` },
      });
    }
    this.assertCanManage(actor, existing);

    const beforeLinks = await this.repo.listClassifications(id);
    const before = this.snapshot(
      existing,
      beforeLinks.map((l) => l.classificationCategoryId),
    );

    await this.db.transaction(async (tx) => {
      await this.repo.delete(id, tx);
      await this.audit.record({
        tx,
        entityType: 'technique',
        entityId: id,
        action: 'delete',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        before,
        after: null,
      });
    });
  }

  // ── Internals ────────────────────────────────────────────────────────
  /**
   * Row-level write check. Uses the CASL ability built from the actor so
   * orgadmin's conditional `manage` rule scopes them to their own org.
   */
  private assertCanManage(actor: AuthenticatedUser, row: TechniqueRow): void {
    const ability = this.abilities.createForUser(actor);
    const subject = {
      __caslSubjectType__: 'Technique' as const,
      createdByOrganisationId: row.createdByOrganisationId,
    };
    if (!ability.can('manage', subject)) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Not allowed to manage this technique.',
        },
      });
    }
  }

  /**
   * Decide which `createdByOrganisationId` to stamp on a freshly-created
   * technique.
   *
   *  - `sysadmin` may pass `null` (global) or an explicit org id.
   *  - non-sysadmin may NOT pass `null`; must supply an org they administer
   *    (or the controller may infer from their single orgadmin membership).
   *  - When non-sysadmin omits the field, we infer from their orgadmin
   *    memberships — but only when exactly one is present, otherwise we
   *    refuse ambiguous calls.
   */
  private resolveOwningOrg(
    actor: AuthenticatedUser,
    requested: string | null | undefined,
  ): string | null {
    if (actor.role === 'sysadmin') {
      return requested === undefined ? null : requested;
    }
    const orgAdminOrgs = actor.memberships
      .filter((m) => m.role === 'orgadmin')
      .map((m) => m.organisationId);
    if (orgAdminOrgs.length === 0) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'You are not an admin of any organisation.',
        },
      });
    }
    if (requested === null) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Only sysadmins can create global techniques.',
        },
      });
    }
    if (requested !== undefined) {
      if (!orgAdminOrgs.includes(requested)) {
        throw new ForbiddenException({
          error: {
            code: 'FORBIDDEN',
            message: 'You are not an admin of that organisation.',
          },
        });
      }
      return requested;
    }
    if (orgAdminOrgs.length > 1) {
      throw new BadRequestException({
        error: {
          code: 'AMBIGUOUS_ORGANISATION',
          message:
            'You administer multiple organisations; specify `organisationId` explicitly.',
        },
      });
    }
    return orgAdminOrgs[0] as string;
  }

  /** Build the column patch, honouring `exactOptionalPropertyTypes`. */
  private buildPatch(input: UpdateTechniqueInput): Partial<TechniqueRow> {
    const patch: Partial<TechniqueRow> = {};
    if ('isKihon' in input && input.isKihon !== undefined) patch.isKihon = input.isKihon;
    if ('isActive' in input && input.isActive !== undefined) patch.isActive = input.isActive;
    if ('sortOrder' in input && input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if ('minRankId' in input && input.minRankId !== undefined) patch.minRankId = input.minRankId;
    if ('nameJa' in input && input.nameJa !== undefined) patch.nameJa = input.nameJa;
    if ('nameRomaji' in input && input.nameRomaji !== undefined) patch.nameRomaji = input.nameRomaji;
    if ('nameSv' in input && input.nameSv !== undefined) patch.nameSv = input.nameSv;
    if ('nameEn' in input && input.nameEn !== undefined) patch.nameEn = input.nameEn;
    if ('nameFi' in input && input.nameFi !== undefined) patch.nameFi = input.nameFi;
    if ('descriptionSv' in input && input.descriptionSv !== undefined)
      patch.descriptionSv = input.descriptionSv;
    if ('descriptionEn' in input && input.descriptionEn !== undefined)
      patch.descriptionEn = input.descriptionEn;
    if ('descriptionFi' in input && input.descriptionFi !== undefined)
      patch.descriptionFi = input.descriptionFi;
    return patch;
  }

  /** Audit-log snapshot — strips internal-only fields and includes link ids. */
  private snapshot(row: TechniqueRow, classificationIds: string[]) {
    return {
      id: row.id,
      createdByOrganisationId: row.createdByOrganisationId,
      isKihon: row.isKihon,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      minRankId: row.minRankId,
      nameJa: row.nameJa,
      nameRomaji: row.nameRomaji,
      nameSv: row.nameSv,
      nameEn: row.nameEn,
      nameFi: row.nameFi,
      descriptionSv: row.descriptionSv,
      descriptionEn: row.descriptionEn,
      descriptionFi: row.descriptionFi,
      classificationIds,
    };
  }

  /**
   * Hydrate a DB row into the API contract — joins the junction rows, resolves
   * each classification's root code, and groups by root.
   */
  private async hydrate(row: TechniqueRow): Promise<Technique> {
    const links = await this.repo.listClassifications(row.id);
    const ids = links.map((l) => l.classificationCategoryId);

    const [categoryRows, rootMap] = await Promise.all([
      this.classificationRepo.findManyByIds(ids),
      this.classifications.getRootMap(),
    ]);

    const byId = new Map<string, ClassificationCategoryRow>();
    for (const r of categoryRows) byId.set(r.id, r);
    const rootRowToCode = new Map<string, RootCode>();
    for (const [code, rootRow] of rootMap.entries()) rootRowToCode.set(rootRow.id, code);

    const classificationsByRoot: Technique['classificationsByRoot'] = {
      technique_type: [],
      sotai_category: [],
      attack_type: [],
    };
    const flat: Array<ClassificationCategory & { rootCode: RootCode }> = [];

    for (const link of links) {
      const cat = byId.get(link.classificationCategoryId);
      if (!cat) continue;
      const rootCode: RootCode | null = cat.parentId
        ? rootRowToCode.get(cat.parentId) ?? null
        : (ROOT_CODES as readonly string[]).includes(cat.code)
          ? (cat.code as RootCode)
          : null;
      if (rootCode === null) continue;
      const api: ClassificationCategory = {
        id: cat.id,
        parentId: cat.parentId,
        rootCode,
        code: cat.code,
        nameEn: cat.nameEn,
        nameSv: cat.nameSv,
        nameFi: cat.nameFi,
        nameJa: cat.nameJa,
        sortOrder: cat.sortOrder,
        isActive: cat.isActive,
      };
      classificationsByRoot[rootCode].push(api);
      flat.push({ ...api, rootCode });
    }

    return {
      id: row.id,
      createdByOrganisationId: row.createdByOrganisationId,
      isKihon: row.isKihon,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      minRankId: row.minRankId,
      nameJa: row.nameJa,
      nameRomaji: row.nameRomaji,
      nameSv: row.nameSv,
      nameEn: row.nameEn,
      nameFi: row.nameFi,
      descriptionSv: row.descriptionSv,
      descriptionEn: row.descriptionEn,
      descriptionFi: row.descriptionFi,
      classificationsByRoot,
      classifications: flat,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
