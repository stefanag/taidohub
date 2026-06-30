import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  rankGradingRequirement,
  rankRequirementHokeiGroup,
  rankRequirementHokeiGroupPattern,
  rankRequirementPattern,
  rankRequirementTechnique,
} from '../../infrastructure/database/schema/grading-requirements.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type RankGradingRequirementRow = typeof rankGradingRequirement.$inferSelect;
export type RankRequirementTechniqueRow = typeof rankRequirementTechnique.$inferSelect;
export type RankRequirementPatternRow = typeof rankRequirementPattern.$inferSelect;
export type RankRequirementHokeiGroupRow = typeof rankRequirementHokeiGroup.$inferSelect;
export type RankRequirementHokeiGroupPatternRow =
  typeof rankRequirementHokeiGroupPattern.$inferSelect;

export type HokeiGroupWithPatternsRow = {
  id: string;
  rankId: string;
  setId: string | null;
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

  private scopeWhere(
    table: { rankId: AnyColumn; setId: AnyColumn },
    rankId: string,
    setId: string | null,
  ) {
    return and(
      eq(table.rankId, rankId),
      setId === null ? isNull(table.setId) : eq(table.setId, setId),
    );
  }

  // -------------------------------------------------------------------------
  // Fetch methods
  // -------------------------------------------------------------------------

  async fetchScalar(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
  ): Promise<RankGradingRequirementRow | null> {
    const client = tx ?? this.db;
    const [row] = await client
      .select()
      .from(rankGradingRequirement)
      .where(this.scopeWhere(rankGradingRequirement, rankId, setId))
      .limit(1);
    return row ?? null;
  }

  async fetchTechniques(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
  ): Promise<RankRequirementTechniqueRow[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(rankRequirementTechnique)
      .where(this.scopeWhere(rankRequirementTechnique, rankId, setId));
  }

  async fetchPatternsWithType(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
  ): Promise<Array<RankRequirementPatternRow & { isKobo: boolean }>> {
    const client = tx ?? this.db;
    return client
      .select({
        id: rankRequirementPattern.id,
        rankId: rankRequirementPattern.rankId,
        setId: rankRequirementPattern.setId,
        patternId: rankRequirementPattern.patternId,
        isTested: rankRequirementPattern.isTested,
        isKobo: sql<boolean>`EXISTS (
          SELECT 1 FROM pattern_classification pc
          JOIN classification_category cc ON cc.id = pc.classification_category_id
          WHERE pc.pattern_id = ${rankRequirementPattern.patternId}
          AND cc.code = 'kobo'
        )`,
      })
      .from(rankRequirementPattern)
      .where(this.scopeWhere(rankRequirementPattern, rankId, setId));
  }

  async fetchHokeiGroups(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
  ): Promise<HokeiGroupWithPatternsRow[]> {
    const client = tx ?? this.db;
    const rows = await client
      .select({
        id: rankRequirementHokeiGroup.id,
        rankId: rankRequirementHokeiGroup.rankId,
        setId: rankRequirementHokeiGroup.setId,
        groupOrder: rankRequirementHokeiGroup.groupOrder,
        pickCount: rankRequirementHokeiGroup.pickCount,
        isTested: rankRequirementHokeiGroup.isTested,
        labelEn: rankRequirementHokeiGroup.labelEn,
        labelFi: rankRequirementHokeiGroup.labelFi,
        labelSv: rankRequirementHokeiGroup.labelSv,
        patternIds: sql<string[]>`
          COALESCE(
            array_agg(${rankRequirementHokeiGroupPattern.patternId} ORDER BY ${rankRequirementHokeiGroupPattern.sortOrder})
            FILTER (WHERE ${rankRequirementHokeiGroupPattern.patternId} IS NOT NULL),
            ARRAY[]::uuid[]
          )
        `,
      })
      .from(rankRequirementHokeiGroup)
      .leftJoin(
        rankRequirementHokeiGroupPattern,
        eq(rankRequirementHokeiGroupPattern.groupId, rankRequirementHokeiGroup.id),
      )
      .where(this.scopeWhere(rankRequirementHokeiGroup, rankId, setId))
      .groupBy(
        rankRequirementHokeiGroup.id,
        rankRequirementHokeiGroup.rankId,
        rankRequirementHokeiGroup.setId,
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

  async deleteScope(
    rankId: string,
    setId: string | null,
    tx?: DrizzleExecutor,
  ): Promise<void> {
    const client = tx ?? this.db;

    // 1. Find group IDs in scope
    const groups = await client
      .select({ id: rankRequirementHokeiGroup.id })
      .from(rankRequirementHokeiGroup)
      .where(this.scopeWhere(rankRequirementHokeiGroup, rankId, setId));

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
      .where(this.scopeWhere(rankRequirementHokeiGroup, rankId, setId));

    // 4. Delete scalar
    await client
      .delete(rankGradingRequirement)
      .where(this.scopeWhere(rankGradingRequirement, rankId, setId));

    // 5. Delete patterns
    await client
      .delete(rankRequirementPattern)
      .where(this.scopeWhere(rankRequirementPattern, rankId, setId));

    // 6. Delete techniques
    await client
      .delete(rankRequirementTechnique)
      .where(this.scopeWhere(rankRequirementTechnique, rankId, setId));
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
      .where(eq(rankGradingRequirement.setId, setId));
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
