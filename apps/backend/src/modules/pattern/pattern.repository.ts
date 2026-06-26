import { Inject, Injectable } from '@nestjs/common';
import type { RootCode } from '@repo/contracts/classification-category';
import { and, asc, eq, exists, inArray, notInArray, sql, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { classificationCategory } from '../../infrastructure/database/schema/classification-category.js';
import {
  pattern,
  patternClassification,
} from '../../infrastructure/database/schema/pattern.js';

export type PatternRow = typeof pattern.$inferSelect;
export type NewPatternRow = typeof pattern.$inferInsert;
export type PatternClassificationRow = typeof patternClassification.$inferSelect;

/**
 * Repository — single source of Drizzle access for the pattern module.
 *
 * Mutating calls accept an optional {@link DrizzleExecutor} so the service can
 * batch the row insert + junction inserts + audit row in a single transaction.
 * Read calls always use the root db handle.
 */
@Injectable()
export class PatternRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Insert a new pattern + initial junction rows. The caller MUST pass a
   * transaction handle so the pattern row and its junctions land atomically
   * with the corresponding audit-log row.
   */
  async createWithLinks(
    input: Omit<NewPatternRow, 'id'> & { classificationIds: string[] },
    tx: DrizzleExecutor,
  ): Promise<string> {
    const { classificationIds, ...row } = input;
    const [inserted] = await tx
      .insert(pattern)
      .values(row)
      .returning({ id: pattern.id });
    if (!inserted) throw new Error('pattern insert returned no rows');

    if (classificationIds.length > 0) {
      const seen = new Set<string>();
      const values: Array<{
        patternId: string;
        classificationCategoryId: string;
        sortOrder: number;
      }> = [];
      for (const [i, catId] of classificationIds.entries()) {
        if (seen.has(catId)) continue;
        seen.add(catId);
        values.push({
          patternId: inserted.id,
          classificationCategoryId: catId,
          sortOrder: i,
        });
      }
      if (values.length > 0) {
        await tx.insert(patternClassification).values(values);
      }
    }
    return inserted.id;
  }

  /** Patch arbitrary pattern columns. Throws if the row is gone. */
  async update(
    id: string,
    patch: Partial<PatternRow>,
    tx?: DrizzleExecutor,
  ): Promise<PatternRow> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(pattern)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(pattern.id, id))
      .returning();
    if (!row) throw new Error(`pattern ${id} not found`);
    return row;
  }

  /**
   * Replace the full classification set: delete-not-in + upsert-with-sortOrder.
   * Preserves the submitted order via the `sort_order` column on the junction.
   */
  /**
   * Replace the full classification set: delete-not-in + bulk upsert.
   * See `TechniqueRepository.replaceClassifications` for the
   * round-trip math and rationale — this is the same shape applied
   * to the pattern junction table.
   */
  async replaceClassifications(
    patternId: string,
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

    // Step 1 — delete rows the new set no longer wants.
    const deleteWhere =
      dedup.length === 0
        ? eq(patternClassification.patternId, patternId)
        : and(
            eq(patternClassification.patternId, patternId),
            notInArray(patternClassification.classificationCategoryId, dedup),
          );
    await executor.delete(patternClassification).where(deleteWhere);

    // Step 2 — bulk upsert the keepers. No-op when nothing to insert.
    if (dedup.length > 0) {
      const values = dedup.map((catId, i) => ({
        patternId,
        classificationCategoryId: catId,
        sortOrder: i,
      }));
      await executor
        .insert(patternClassification)
        .values(values)
        .onConflictDoUpdate({
          target: [
            patternClassification.patternId,
            patternClassification.classificationCategoryId,
          ],
          set: { sortOrder: sql`excluded.sort_order` },
        });
    }
  }

  /** Single row by id, or `null` if missing. */
  async findById(id: string, tx?: DrizzleExecutor): Promise<PatternRow | null> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(pattern)
      .where(eq(pattern.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Junction rows for a pattern, ordered by sortOrder. */
  async listClassifications(
    patternId: string,
    tx?: DrizzleExecutor,
  ): Promise<Array<{ classificationCategoryId: string; sortOrder: number }>> {
    const executor = tx ?? this.db;
    return executor
      .select({
        classificationCategoryId: patternClassification.classificationCategoryId,
        sortOrder: patternClassification.sortOrder,
      })
      .from(patternClassification)
      .where(eq(patternClassification.patternId, patternId))
      .orderBy(asc(patternClassification.sortOrder));
  }

  /**
   * Batched junction lookup for a page of patterns: ONE SELECT
   * returning every junction row for the given pattern ids, ordered
   * so each pattern's links land in `sortOrder` once the caller
   * groups by `patternId`.
   *
   * Mirrors `TechniqueRepository.listClassificationsByTechniqueIds`
   * — see that method's docstring for the round-trip math and the
   * 1+N regression this guards against on the patterns list path.
   *
   * Returns an empty array immediately when there are no ids — never
   * issues a `WHERE id IN ()` query, which Postgres rejects pre-12
   * and Drizzle handles inconsistently across executor types.
   */
  async listClassificationsByPatternIds(
    patternIds: string[],
    tx?: DrizzleExecutor,
  ): Promise<Array<{ patternId: string; classificationCategoryId: string; sortOrder: number }>> {
    if (patternIds.length === 0) return [];
    const executor = tx ?? this.db;
    return executor
      .select({
        patternId: patternClassification.patternId,
        classificationCategoryId: patternClassification.classificationCategoryId,
        sortOrder: patternClassification.sortOrder,
      })
      .from(patternClassification)
      .where(inArray(patternClassification.patternId, patternIds))
      .orderBy(
        asc(patternClassification.patternId),
        asc(patternClassification.sortOrder),
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
  }): Promise<PatternRow[]> {
    const conds: SQL[] = [];

    if (!filters.includeInactive) {
      conds.push(eq(pattern.isActive, true));
    }

    if (filters.organisationId !== null) {
      conds.push(eq(pattern.createdByOrganisationId, filters.organisationId));
    }

    for (const ids of filters.classificationIdsByRoot.values()) {
      if (ids.length === 0) continue;
      conds.push(
        exists(
          this.db
            .select({ x: sql`1` })
            .from(patternClassification)
            .innerJoin(
              classificationCategory,
              eq(classificationCategory.id, patternClassification.classificationCategoryId),
            )
            .where(
              and(
                eq(patternClassification.patternId, pattern.id),
                inArray(patternClassification.classificationCategoryId, ids),
              ),
            ),
        ),
      );
    }

    const where = conds.length === 0 ? undefined : and(...conds);
    return this.db
      .select()
      .from(pattern)
      .where(where)
      .orderBy(asc(pattern.sortOrder), asc(pattern.createdAt));
  }

  /** Delete a pattern. The DB cascades the junction rows. */
  async delete(id: string, tx?: DrizzleExecutor): Promise<void> {
    const executor = tx ?? this.db;
    await executor.delete(pattern).where(eq(pattern.id, id));
  }
}
