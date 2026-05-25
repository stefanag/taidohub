import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  beltRanks,
  rankHistory,
  shogoTitles,
  user,
  type DbRankHistory,
  type DbNewRankHistory,
} from '../../infrastructure/database/schema/index.js';

/**
 * The set of `rank_history` columns the service may write. `id`, `source`,
 * `eventId`, `userId`, `recordedByUserId`, `createdAt` are stamped on insert
 * and never patched through this API.
 */
export type RankHistoryWritePatch = Partial<
  Pick<
    DbRankHistory,
    | 'rankId'
    | 'shogoTitle'
    | 'date'
    | 'examinerName'
    | 'organisationName'
    | 'notes'
    | 'verified'
    | 'verifiedByUserId'
    | 'verifiedAt'
    | 'updatedAt'
    | 'updatedByUserId'
  >
>;

export interface JoinedRankHistoryRow {
  row: DbRankHistory;
  rank: { id: string; systemId: string; level: number; beltColor: string };
  verifiedBy: { id: string; name: string | null } | null;
}

@Injectable()
export class RankHistoryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbRankHistory | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(rankHistory).where(eq(rankHistory.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByIdJoined(
    id: string,
    tx?: DrizzleExecutor,
  ): Promise<JoinedRankHistoryRow | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({
        history: rankHistory,
        rankId: beltRanks.id,
        systemId: beltRanks.systemId,
        level: beltRanks.level,
        beltColor: beltRanks.beltColor,
        verifierId: user.id,
        verifierName: user.name,
      })
      .from(rankHistory)
      .innerJoin(beltRanks, eq(beltRanks.id, rankHistory.rankId))
      .leftJoin(user, eq(user.id, rankHistory.verifiedByUserId))
      .where(eq(rankHistory.id, id))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    return {
      row: r.history,
      rank: { id: r.rankId, systemId: r.systemId, level: r.level, beltColor: r.beltColor },
      verifiedBy: r.verifierId ? { id: r.verifierId, name: r.verifierName } : null,
    };
  }

  /** Raw rows for the admin GET /api/rank-history/:userId endpoint. */
  async listByUser(userId: string, tx?: DrizzleExecutor): Promise<DbRankHistory[]> {
    const conn = tx ?? this.db;
    return conn
      .select()
      .from(rankHistory)
      .where(eq(rankHistory.userId, userId))
      .orderBy(desc(rankHistory.date));
  }

  /** Joined rows for the unified projection (rank + verifiedBy hydration). */
  async listByUserJoined(
    userId: string,
    tx?: DrizzleExecutor,
  ): Promise<JoinedRankHistoryRow[]> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({
        history: rankHistory,
        rankId: beltRanks.id,
        systemId: beltRanks.systemId,
        level: beltRanks.level,
        beltColor: beltRanks.beltColor,
        verifierId: user.id,
        verifierName: user.name,
      })
      .from(rankHistory)
      .innerJoin(beltRanks, eq(beltRanks.id, rankHistory.rankId))
      .leftJoin(user, eq(user.id, rankHistory.verifiedByUserId))
      .where(eq(rankHistory.userId, userId))
      .orderBy(desc(rankHistory.date));

    return rows.map((r) => ({
      row: r.history,
      rank: { id: r.rankId, systemId: r.systemId, level: r.level, beltColor: r.beltColor },
      verifiedBy: r.verifierId ? { id: r.verifierId, name: r.verifierName } : null,
    }));
  }

  async insert(input: DbNewRankHistory, tx?: DrizzleExecutor): Promise<DbRankHistory> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(rankHistory).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    patch: RankHistoryWritePatch,
    tx?: DrizzleExecutor,
  ): Promise<DbRankHistory | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(rankHistory)
      .set(patch)
      .where(eq(rankHistory.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<void> {
    const conn = tx ?? this.db;
    await conn.delete(rankHistory).where(eq(rankHistory.id, id));
  }

  /**
   * Find the highest verified shogo across a user's history (ordered by
   * `shogo_titles.sort_order DESC`, breaking ties by `date DESC`). Returns
   * the shogo code or null if the user has no verified shogo.
   */
  async findHighestVerifiedShogo(
    userId: string,
    tx?: DrizzleExecutor,
  ): Promise<{ code: string } | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ code: rankHistory.shogoTitle })
      .from(rankHistory)
      .innerJoin(shogoTitles, eq(shogoTitles.code, rankHistory.shogoTitle))
      .where(
        and(
          eq(rankHistory.userId, userId),
          eq(rankHistory.verified, true),
          isNotNull(rankHistory.shogoTitle),
        ),
      )
      .orderBy(desc(shogoTitles.sortOrder), desc(rankHistory.date))
      .limit(1);

    const row = rows[0];
    if (!row?.code) return null;
    return { code: row.code };
  }
}
