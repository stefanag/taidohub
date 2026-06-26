import { Inject, Injectable } from '@nestjs/common';
import type { RootCode } from '@repo/contracts/classification-category';
import { and, asc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { classificationCategory } from '../../infrastructure/database/schema/classification-category.js';
import {
  technique,
  techniqueClassification,
} from '../../infrastructure/database/schema/technique.js';

export type TechniqueRow = typeof technique.$inferSelect;
export type NewTechniqueRow = typeof technique.$inferInsert;
export type TechniqueClassificationRow = typeof techniqueClassification.$inferSelect;

/**
 * Repository — single source of Drizzle access for the technique module.
 *
 * Mutating calls accept an optional {@link DrizzleExecutor} so the service can
 * batch the row insert + junction inserts + audit row in a single transaction.
 * Read calls always use the root db handle.
 */
@Injectable()
export class TechniqueRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Insert a new technique + initial junction rows. The caller MUST pass a
   * transaction handle so the technique row and its junctions land atomically
   * with the corresponding audit-log row.
   */
  async createWithLinks(
    input: Omit<NewTechniqueRow, 'id'> & { classificationIds: string[] },
    tx: DrizzleExecutor,
  ): Promise<string> {
    const { classificationIds, ...row } = input;
    const [inserted] = await tx
      .insert(technique)
      .values(row)
      .returning({ id: technique.id });
    if (!inserted) throw new Error('technique insert returned no rows');

    if (classificationIds.length > 0) {
      const seen = new Set<string>();
      const values: Array<{
        techniqueId: string;
        classificationCategoryId: string;
        sortOrder: number;
      }> = [];
      for (const [i, catId] of classificationIds.entries()) {
        if (seen.has(catId)) continue;
        seen.add(catId);
        values.push({
          techniqueId: inserted.id,
          classificationCategoryId: catId,
          sortOrder: i,
        });
      }
      if (values.length > 0) {
        await tx.insert(techniqueClassification).values(values);
      }
    }
    return inserted.id;
  }

  /** Patch arbitrary technique columns. Throws if the row is gone. */
  async update(
    id: string,
    patch: Partial<TechniqueRow>,
    tx?: DrizzleExecutor,
  ): Promise<TechniqueRow> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(technique)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(technique.id, id))
      .returning();
    if (!row) throw new Error(`technique ${id} not found`);
    return row;
  }

  /**
   * Replace the full classification set: delete-not-in + upsert-with-sortOrder.
   * Preserves the submitted order via the `sort_order` column on the junction.
   */
  async replaceClassifications(
    techniqueId: string,
    classificationIds: string[],
    tx?: DrizzleExecutor,
  ): Promise<void> {
    const executor = tx ?? this.db;
    const dedup: string[] = [];
    {
      const seen = new Set<string>();
      for (const id of classificationIds) {
        if (!seen.has(id)) {
          seen.add(id);
          dedup.push(id);
        }
      }
    }

    const existing = await executor
      .select({ id: techniqueClassification.classificationCategoryId })
      .from(techniqueClassification)
      .where(eq(techniqueClassification.techniqueId, techniqueId));

    const existingSet = new Set(existing.map((r) => r.id));
    const keepSet = new Set(dedup);
    const toRemove = [...existingSet].filter((x) => !keepSet.has(x));

    if (toRemove.length > 0) {
      await executor
        .delete(techniqueClassification)
        .where(
          and(
            eq(techniqueClassification.techniqueId, techniqueId),
            inArray(techniqueClassification.classificationCategoryId, toRemove),
          ),
        );
    }

    for (const [i, catId] of dedup.entries()) {
      await executor
        .insert(techniqueClassification)
        .values({
          techniqueId,
          classificationCategoryId: catId,
          sortOrder: i,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            techniqueClassification.techniqueId,
            techniqueClassification.classificationCategoryId,
          ],
          set: { sortOrder: i },
        });
    }
  }

  /** Single row by id, or `null` if missing. */
  async findById(id: string, tx?: DrizzleExecutor): Promise<TechniqueRow | null> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(technique)
      .where(eq(technique.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Junction rows for a technique, ordered by sortOrder. */
  async listClassifications(
    techniqueId: string,
    tx?: DrizzleExecutor,
  ): Promise<Array<{ classificationCategoryId: string; sortOrder: number }>> {
    const executor = tx ?? this.db;
    return executor
      .select({
        classificationCategoryId: techniqueClassification.classificationCategoryId,
        sortOrder: techniqueClassification.sortOrder,
      })
      .from(techniqueClassification)
      .where(eq(techniqueClassification.techniqueId, techniqueId))
      .orderBy(asc(techniqueClassification.sortOrder));
  }

  /**
   * Batched junction lookup for a page of techniques: ONE SELECT
   * returning every junction row for the given technique ids, ordered
   * so each technique's links land in `sortOrder` once the caller
   * groups by `techniqueId`.
   *
   * Replaces the 1+N pattern in `TechniqueService.list` where each
   * row triggered its own `listClassifications(rowId)`. With a page
   * of 50 techniques averaging 3 classifications each, this drops
   * the hydration round-trip count from 50 to 1.
   *
   * Returns an empty array immediately when there are no ids — never
   * issues a `WHERE id IN ()` query, which Postgres would treat as
   * a syntax error in older versions and Drizzle handles
   * inconsistently across executor types.
   */
  async listClassificationsByTechniqueIds(
    techniqueIds: string[],
    tx?: DrizzleExecutor,
  ): Promise<Array<{ techniqueId: string; classificationCategoryId: string; sortOrder: number }>> {
    if (techniqueIds.length === 0) return [];
    const executor = tx ?? this.db;
    return executor
      .select({
        techniqueId: techniqueClassification.techniqueId,
        classificationCategoryId: techniqueClassification.classificationCategoryId,
        sortOrder: techniqueClassification.sortOrder,
      })
      .from(techniqueClassification)
      .where(inArray(techniqueClassification.techniqueId, techniqueIds))
      .orderBy(
        asc(techniqueClassification.techniqueId),
        asc(techniqueClassification.sortOrder),
      );
  }

  /**
   * Multi-dimension filter: one `EXISTS (…)` clause per root in
   * `classificationIdsByRoot` (OR within a group, AND across groups).
   *
   * `includeInactive=false` filters out soft-deleted rows. `organisationId`
   * narrows the query when supplied (`null` = no narrowing).
   */
  async list(filters: {
    classificationIdsByRoot: Map<RootCode, string[]>;
    includeInactive: boolean;
    organisationId: string | null;
  }): Promise<TechniqueRow[]> {
    const conds: SQL[] = [];

    if (!filters.includeInactive) {
      conds.push(eq(technique.isActive, true));
    }

    if (filters.organisationId !== null) {
      conds.push(eq(technique.createdByOrganisationId, filters.organisationId));
    }

    for (const ids of filters.classificationIdsByRoot.values()) {
      if (ids.length === 0) continue;
      conds.push(
        exists(
          this.db
            .select({ x: sql`1` })
            .from(techniqueClassification)
            .innerJoin(
              classificationCategory,
              eq(classificationCategory.id, techniqueClassification.classificationCategoryId),
            )
            .where(
              and(
                eq(techniqueClassification.techniqueId, technique.id),
                inArray(techniqueClassification.classificationCategoryId, ids),
              ),
            ),
        ),
      );
    }

    const where = conds.length === 0 ? undefined : and(...conds);
    return this.db
      .select()
      .from(technique)
      .where(where)
      .orderBy(asc(technique.sortOrder), asc(technique.createdAt));
  }

  /** Delete a technique. The DB cascades the junction rows. */
  async delete(id: string, tx?: DrizzleExecutor): Promise<void> {
    const executor = tx ?? this.db;
    await executor.delete(technique).where(eq(technique.id, id));
  }
}
