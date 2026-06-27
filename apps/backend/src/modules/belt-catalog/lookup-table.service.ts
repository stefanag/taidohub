import { ConflictException, NotFoundException } from '@nestjs/common';

import { type DrizzleExecutor } from '../../infrastructure/database/client.js';

/**
 * Repository contract a {@link LookupTableService} expects. Any repo
 * implementing this interface can be wrapped by the base service.
 * The two parametric types are:
 *
 *   - `TKey` — the natural key used to identify a row. Usually a
 *     UUID string (`belt_systems.id`) but sometimes a textual code
 *     (`shogo_titles.code`).
 *   - `TRow` — the row shape returned by Drizzle.
 *   - `TNewRow` — values accepted by `insert()` (Drizzle's "new"
 *     type usually omits id/createdAt/updatedAt).
 *   - `TPatch` — partial shape accepted by `update()`.
 */
export interface LookupTableRepository<TKey, TRow, TNewRow, TPatch> {
  findByKey(key: TKey, tx?: DrizzleExecutor): Promise<TRow | null>;
  findAll(tx?: DrizzleExecutor): Promise<TRow[]>;
  insert(input: TNewRow, tx?: DrizzleExecutor): Promise<TRow>;
  update(key: TKey, patch: TPatch, tx?: DrizzleExecutor): Promise<TRow | null>;
  delete(key: TKey, tx?: DrizzleExecutor): Promise<void>;
}

/**
 * Abstract base for the "small reference table" CRUD services in the
 * belt-catalog feature. The plain CRUD plumbing (list, lookup by key,
 * create, update, delete with in-use guard) is identical across every
 * lookup table; only the row → API mapping, the insert/patch payload
 * builders, and the delete guard differ. Subclasses provide those four
 * hooks and inherit the rest.
 *
 * # What does NOT belong here
 *
 * The base is deliberately small. Anything that requires touching
 * other tables (joins, multi-row aggregates) or that has bespoke
 * validation rules (cycle checks on `nextRankId`, slug-requires-
 * `publiclyVisible` refinements on belt ranks) lives in the concrete
 * service. `BeltRanksService` does enough of both that it's NOT
 * migrated to this base — see the docstring there for the rationale.
 *
 * # Why not a full generic CRUD framework
 *
 * We considered making this a generic factory with config-driven
 * field mapping (à la NestJS's `@nestjs-mod/crud`). The pragmatic
 * answer: the lookup tables ARE small. A 50-line abstract class
 * with five abstract hooks is easier to read AND easier to grep
 * than a 500-line factory + decorators + metadata schema. When a
 * fourth lookup table shows up we get linear-scale duplication
 * savings; we don't need quadratic-scale abstraction to capture
 * them.
 */
export abstract class LookupTableService<
  TKey,
  TRow,
  TApi,
  TCreate,
  TUpdate,
  TNewRow,
  TPatch,
> {
  protected abstract readonly repo: LookupTableRepository<TKey, TRow, TNewRow, TPatch>;
  /** Singular noun for the entity, e.g. 'Belt system'. Used in 404 messages. */
  protected abstract readonly entityLabel: string;

  /** Map a raw DB row to its API shape (timestamps stringified, jsonb cast). */
  protected abstract toApi(row: TRow): TApi;
  /** Build the values to pass to `repo.insert()` from a create input. */
  protected abstract inputToInsertValues(input: TCreate): TNewRow;
  /** Build the partial patch to pass to `repo.update()` from an update input. */
  protected abstract inputToPatch(input: TUpdate): TPatch;
  /**
   * Throw a {@link ConflictException} if `existing` cannot be deleted
   * (e.g. another table still references it). Resolve normally when
   * deletion is safe.
   */
  protected abstract assertCanDelete(existing: TRow): Promise<void>;

  async list(): Promise<TApi[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findByKey(key: TKey): Promise<TApi> {
    const row = await this.lookupByKey(key);
    if (!row) throw this.notFound(key);
    return this.toApi(row);
  }

  async create(input: TCreate): Promise<TApi> {
    const row = await this.repo.insert(this.inputToInsertValues(input));
    return this.toApi(row);
  }

  async update(key: TKey, input: TUpdate): Promise<TApi> {
    const row = await this.repo.update(key, this.inputToPatch(input));
    if (!row) throw this.notFound(key);
    return this.toApi(row);
  }

  async delete(key: TKey): Promise<void> {
    const existing = await this.lookupByKey(key);
    if (!existing) throw this.notFound(key);
    await this.assertCanDelete(existing);
    await this.repo.delete(key);
  }

  /**
   * Hook for subclasses that want to call the repo's natural lookup
   * method directly (e.g. `findById`/`findByCode`) instead of the
   * `findByKey` alias. Default implementation calls `findByKey`.
   * Subclasses override when the repo's natural method is what
   * tests mock against.
   */
  protected lookupByKey(key: TKey): Promise<TRow | null> {
    return this.repo.findByKey(key);
  }

  protected notFound(key: TKey): NotFoundException {
    return new NotFoundException({
      error: { code: 'NOT_FOUND', message: `${this.entityLabel} ${String(key)} not found.` },
    });
  }
}
