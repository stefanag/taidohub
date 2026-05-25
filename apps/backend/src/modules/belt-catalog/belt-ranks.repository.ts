import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  beltRanks,
  rankHistory,
  shogoTitles,
  type DbBeltRank,
  type DbNewBeltRank,
} from '../../infrastructure/database/schema/index.js';

/** Writeable subset of `belt_ranks` columns. `id`, `createdAt`, `updatedAt` are managed here. */
export type BeltRankPatch = Partial<
  Pick<
    DbBeltRank,
    | 'organisationId'
    | 'systemId'
    | 'level'
    | 'sortOrder'
    | 'nameJa'
    | 'nameRomaji'
    | 'nameEn'
    | 'nameSv'
    | 'nameFi'
    | 'beltColor'
    | 'imageUrl'
    | 'descriptionEn'
    | 'descriptionSv'
    | 'descriptionFi'
    | 'publiclyVisible'
    | 'slug'
    | 'minAge'
    | 'nextRankId'
  >
>;

@Injectable()
export class BeltRanksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbBeltRank | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(beltRanks).where(eq(beltRanks.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findAll(tx?: DrizzleExecutor): Promise<DbBeltRank[]> {
    const conn = tx ?? this.db;
    return conn.select().from(beltRanks).orderBy(beltRanks.sortOrder, beltRanks.level);
  }

  /** Lookup by `(system_id, level)` within a scope (org-private or global). */
  async findBySystemAndLevel(
    organisationId: string | null,
    systemId: string,
    level: number,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltRank | null> {
    const conn = tx ?? this.db;
    const orgFilter =
      organisationId === null
        ? isNull(beltRanks.organisationId)
        : eq(beltRanks.organisationId, organisationId);
    const rows = await conn
      .select()
      .from(beltRanks)
      .where(and(orgFilter, eq(beltRanks.systemId, systemId), eq(beltRanks.level, level)))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(input: DbNewBeltRank, tx?: DrizzleExecutor): Promise<DbBeltRank> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(beltRanks).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    patch: BeltRankPatch,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltRank | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(beltRanks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(beltRanks.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<void> {
    const conn = tx ?? this.db;
    await conn.delete(beltRanks).where(eq(beltRanks.id, id));
  }

  // ---- Rank-delete guard helpers (spec §5 rule 6) ----

  /** Count `rank_history` rows referencing this rank — used by the delete guard. */
  async countHistoryUsingRank(rankId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(rankHistory)
      .where(eq(rankHistory.rankId, rankId));
    return Number(rows[0]?.value ?? 0);
  }

  /** Count `belt_ranks` rows pointing at this rank as their `next_rank_id`. */
  async countNextRankPointers(rankId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(beltRanks)
      .where(eq(beltRanks.nextRankId, rankId));
    return Number(rows[0]?.value ?? 0);
  }

  /** Count `shogo_titles` rows referencing this rank as their `min_rank_id`. */
  async countShogosUsingRank(rankId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(shogoTitles)
      .where(eq(shogoTitles.minRankId, rankId));
    return Number(rows[0]?.value ?? 0);
  }

  /**
   * v1 no-op: always returns 0.
   *
   * The full guard would query `user_profile.current_rank_id`, but that column
   * does not exist until followup D4 lands. Until then this method is a
   * placeholder so `BeltRanksService.delete` can call it unconditionally
   * without a code change when D4 ships.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async countUserProfilesUsingRank(_rankId: string, _tx?: DrizzleExecutor): Promise<number> {
    return 0;
  }
}
