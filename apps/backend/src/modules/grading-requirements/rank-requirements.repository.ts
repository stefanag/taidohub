import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';


import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { beltRanks } from '../../infrastructure/database/schema/belt-ranks.js';
import { beltSystems } from '../../infrastructure/database/schema/belt-systems.js';
import {
  rankGradingRequirement,
  rankRequirementAgeGroup,
  rankRequirementHokeiGroup,
  rankRequirementHokeiGroupPattern,
  rankRequirementPattern,
  rankRequirementTechnique,
} from '../../infrastructure/database/schema/grading-requirements.js';

import type { AnyColumn } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type RankGradingRequirementRow = typeof rankGradingRequirement.$inferSelect;
export type RankRequirementTechniqueRow = typeof rankRequirementTechnique.$inferSelect;
export type RankRequirementPatternRow = typeof rankRequirementPattern.$inferSelect;
export type RankRequirementHokeiGroupRow = typeof rankRequirementHokeiGroup.$inferSelect;
export type RankRequirementHokeiGroupPatternRow =
  typeof rankRequirementHokeiGroupPattern.$inferSelect;

export type RankRequirementAgeGroupRow = typeof rankRequirementAgeGroup.$inferSelect;

export type HokeiGroupWithPatternsRow = {
  id: string;
  rankId: string;
  setId: string | null;
  ageGroupId: string | null;
  groupOrder: number;
  pickCount: number;
  isTested: boolean;
  labelEn: string | null;
  labelFi: string | null;
  labelSv: string | null;
  patternIds: string[];
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

@Injectable()
export class RankRequirementsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  // -------------------------------------------------------------------------
  // Internal helper
  // -------------------------------------------------------------------------

  /**
   * One requirement scope: (rank, set, age group). `ageGroupId = null` is the
   * base requirement; both nullable keys use the null-aware pattern.
   */
  private scopeWhere(
    table: { rankId: AnyColumn; setId: AnyColumn; ageGroupId: AnyColumn },
    rankId: string,
    setId: string | null,
    ageGroupId: string | null = null,
  ) {
    return and(
      eq(table.rankId, rankId),
      setId === null ? isNull(table.setId) : eq(table.setId, setId),
      ageGroupId === null ? isNull(table.ageGroupId) : eq(table.ageGroupId, ageGroupId),
    );
  }

  // -------------------------------------------------------------------------
  // Age groups
  // -------------------------------------------------------------------------

  async listAgeGroups(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
  ): Promise<RankRequirementAgeGroupRow[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(rankRequirementAgeGroup)
      .where(
        and(
          eq(rankRequirementAgeGroup.rankId, rankId),
          setId === null ? isNull(rankRequirementAgeGroup.setId) : eq(rankRequirementAgeGroup.setId, setId),
        ),
      )
      .orderBy(sql`${rankRequirementAgeGroup.ageFrom} ASC NULLS FIRST`);
  }

  async insertAgeGroup(
    row: { rankId: string; setId: string | null; ageFrom: number | null; ageTo: number | null },
    tx: DrizzleExecutor,
  ): Promise<RankRequirementAgeGroupRow> {
    const [inserted] = await tx.insert(rankRequirementAgeGroup).values(row).returning();
    if (!inserted) throw new Error('insertAgeGroup returned no rows.');
    return inserted;
  }

  async updateAgeGroup(
    id: string,
    bounds: { ageFrom: number | null; ageTo: number | null },
    tx: DrizzleExecutor,
  ): Promise<void> {
    await tx
      .update(rankRequirementAgeGroup)
      .set({ ...bounds, updatedAt: new Date() })
      .where(eq(rankRequirementAgeGroup.id, id));
  }

  /** Deletes groups; their variant rows go with them (FK cascade). */
  async deleteAgeGroups(ids: string[], tx: DrizzleExecutor): Promise<void> {
    if (ids.length === 0) return;
    await tx.delete(rankRequirementAgeGroup).where(inArray(rankRequirementAgeGroup.id, ids));
  }

  /** The rank's belt-system code (`kyu`, `dan`, `mon`), or null for an unknown rank. */
  async rankSystemCode(rankId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ code: beltSystems.code })
      .from(beltRanks)
      .innerJoin(beltSystems, eq(beltSystems.id, beltRanks.systemId))
      .where(eq(beltRanks.id, rankId))
      .limit(1);
    return row?.code ?? null;
  }

  // -------------------------------------------------------------------------
  // Fetch methods
  // -------------------------------------------------------------------------

  async fetchScalar(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
    ageGroupId: string | null = null,
  ): Promise<RankGradingRequirementRow | null> {
    const client = tx ?? this.db;
    const [row] = await client
      .select()
      .from(rankGradingRequirement)
      .where(this.scopeWhere(rankGradingRequirement, rankId, setId, ageGroupId))
      .limit(1);
    return row ?? null;
  }

  async fetchTechniques(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
    ageGroupId: string | null = null,
  ): Promise<RankRequirementTechniqueRow[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(rankRequirementTechnique)
      .where(this.scopeWhere(rankRequirementTechnique, rankId, setId, ageGroupId));
  }

  async fetchPatternsWithType(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
    ageGroupId: string | null = null,
  ): Promise<Array<RankRequirementPatternRow & { isKobo: boolean }>> {
    const client = tx ?? this.db;
    return client
      .select({
        id: rankRequirementPattern.id,
        rankId: rankRequirementPattern.rankId,
        setId: rankRequirementPattern.setId,
        ageGroupId: rankRequirementPattern.ageGroupId,
        patternId: rankRequirementPattern.patternId,
        isTested: rankRequirementPattern.isTested,
        // The outer column is spelled out with its table: an interpolated
        // column renders unqualified in a single-table select, which inside
        // this subquery bound to `pc.pattern_id` and made every pattern kobo.
        isKobo: sql<boolean>`EXISTS (
          SELECT 1 FROM pattern_classification pc
          JOIN classification_category cc ON cc.id = pc.classification_category_id
          WHERE pc.pattern_id = "rank_requirement_pattern"."pattern_id"
          AND cc.code = 'kobo'
        )`,
      })
      .from(rankRequirementPattern)
      .where(this.scopeWhere(rankRequirementPattern, rankId, setId, ageGroupId));
  }

  async fetchHokeiGroups(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
    ageGroupId: string | null = null,
  ): Promise<HokeiGroupWithPatternsRow[]> {
    const client = tx ?? this.db;
    const rows = await client
      .select({
        id: rankRequirementHokeiGroup.id,
        rankId: rankRequirementHokeiGroup.rankId,
        setId: rankRequirementHokeiGroup.setId,
        ageGroupId: rankRequirementHokeiGroup.ageGroupId,
        groupOrder: rankRequirementHokeiGroup.groupOrder,
        pickCount: rankRequirementHokeiGroup.pickCount,
        isTested: rankRequirementHokeiGroup.isTested,
        labelEn: rankRequirementHokeiGroup.labelEn,
        labelFi: rankRequirementHokeiGroup.labelFi,
        labelSv: rankRequirementHokeiGroup.labelSv,
        patternIds: sql<string[]>`
          COALESCE(
            json_agg(${rankRequirementHokeiGroupPattern.patternId} ORDER BY ${rankRequirementHokeiGroupPattern.sortOrder})
            FILTER (WHERE ${rankRequirementHokeiGroupPattern.patternId} IS NOT NULL),
            '[]'::json
          )
        `,
      })
      .from(rankRequirementHokeiGroup)
      .leftJoin(
        rankRequirementHokeiGroupPattern,
        eq(rankRequirementHokeiGroupPattern.groupId, rankRequirementHokeiGroup.id),
      )
      .where(this.scopeWhere(rankRequirementHokeiGroup, rankId, setId, ageGroupId))
      .groupBy(
        rankRequirementHokeiGroup.id,
        rankRequirementHokeiGroup.rankId,
        rankRequirementHokeiGroup.setId,
        rankRequirementHokeiGroup.ageGroupId,
        rankRequirementHokeiGroup.groupOrder,
        rankRequirementHokeiGroup.pickCount,
        rankRequirementHokeiGroup.isTested,
        rankRequirementHokeiGroup.labelEn,
        rankRequirementHokeiGroup.labelFi,
        rankRequirementHokeiGroup.labelSv,
      );
    return rows;
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /** Removes a rank from a set entirely: its age groups (and so their variants) and the base. */
  async deleteRankFromSet(rankId: string, setId: string | null, tx: DrizzleExecutor): Promise<void> {
    const groups = await this.listAgeGroups(rankId, setId, tx);
    await this.deleteAgeGroups(
      groups.map((g) => g.id),
      tx,
    );
    await this.deleteScope(rankId, setId, tx, null);
  }

  async deleteScope(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
    ageGroupId: string | null = null,
  ): Promise<void> {
    const client = tx ?? this.db;

    // 1. Find group IDs in scope
    const groups = await client
      .select({ id: rankRequirementHokeiGroup.id })
      .from(rankRequirementHokeiGroup)
      .where(this.scopeWhere(rankRequirementHokeiGroup, rankId, setId, ageGroupId));

    const groupIds = groups.map((g) => g.id);

    // 2. Delete group-patterns (no set_id column; filter via group IDs)
    if (groupIds.length > 0) {
      await client
        .delete(rankRequirementHokeiGroupPattern)
        .where(inArray(rankRequirementHokeiGroupPattern.groupId, groupIds));
    }

    // 3. Delete groups
    await client
      .delete(rankRequirementHokeiGroup)
      .where(this.scopeWhere(rankRequirementHokeiGroup, rankId, setId, ageGroupId));

    // 4. Delete scalar
    await client
      .delete(rankGradingRequirement)
      .where(this.scopeWhere(rankGradingRequirement, rankId, setId, ageGroupId));

    // 5. Delete patterns
    await client
      .delete(rankRequirementPattern)
      .where(this.scopeWhere(rankRequirementPattern, rankId, setId, ageGroupId));

    // 6. Delete techniques
    await client
      .delete(rankRequirementTechnique)
      .where(this.scopeWhere(rankRequirementTechnique, rankId, setId, ageGroupId));
  }

  // -------------------------------------------------------------------------
  // Distinct rank helpers
  // -------------------------------------------------------------------------

  async distinctRankIdsForSet(
    setId: string,
    tx?: DrizzleExecutor,
  ): Promise<string[]> {
    const client = tx ?? this.db;
    const rows = await client
      .selectDistinct({ rankId: rankGradingRequirement.rankId })
      .from(rankGradingRequirement)
      .where(and(eq(rankGradingRequirement.setId, setId), isNull(rankGradingRequirement.ageGroupId)));
    return rows.map((r) => r.rankId);
  }

  // -------------------------------------------------------------------------
  // Insert methods
  // -------------------------------------------------------------------------

  async insertScalar(
    row: typeof rankGradingRequirement.$inferInsert,
    tx?: DrizzleExecutor,
  ): Promise<RankGradingRequirementRow> {
    const client = tx ?? this.db;
    const [inserted] = await client
      .insert(rankGradingRequirement)
      .values(row)
      .returning();
    if (!inserted) throw new Error('insertScalar returned no rows.');
    return inserted;
  }

  async insertTechniques(
    rows: Array<typeof rankRequirementTechnique.$inferInsert>,
    tx?: DrizzleExecutor,
  ): Promise<void> {
    if (rows.length === 0) return;
    const client = tx ?? this.db;
    await client.insert(rankRequirementTechnique).values(rows);
  }

  async insertPatterns(
    rows: Array<typeof rankRequirementPattern.$inferInsert>,
    tx?: DrizzleExecutor,
  ): Promise<void> {
    if (rows.length === 0) return;
    const client = tx ?? this.db;
    await client.insert(rankRequirementPattern).values(rows);
  }

  async insertHokeiGroup(
    row: typeof rankRequirementHokeiGroup.$inferInsert,
    tx?: DrizzleExecutor,
  ): Promise<RankRequirementHokeiGroupRow> {
    const client = tx ?? this.db;
    const [inserted] = await client
      .insert(rankRequirementHokeiGroup)
      .values(row)
      .returning();
    if (!inserted) throw new Error('insertHokeiGroup returned no rows.');
    return inserted;
  }

  async insertHokeiGroupPatterns(
    rows: Array<typeof rankRequirementHokeiGroupPattern.$inferInsert>,
    tx?: DrizzleExecutor,
  ): Promise<void> {
    if (rows.length === 0) return;
    const client = tx ?? this.db;
    await client.insert(rankRequirementHokeiGroupPattern).values(rows);
  }
}
