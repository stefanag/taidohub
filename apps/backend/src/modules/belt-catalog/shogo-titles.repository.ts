import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  rankHistory,
  shogoTitles,
  userProfile,
  type DbShogoTitle,
  type DbNewShogoTitle,
} from '../../infrastructure/database/schema/index.js';

export type ShogoTitlePatch = Partial<
  Pick<DbShogoTitle, 'nameEn' | 'nameSv' | 'nameFi' | 'nameJa' | 'minRankId' | 'sortOrder'>
>;

@Injectable()
export class ShogoTitlesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByCode(code: string, tx?: DrizzleExecutor): Promise<DbShogoTitle | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(shogoTitles).where(eq(shogoTitles.code, code)).limit(1);
    return rows[0] ?? null;
  }

  async findAll(tx?: DrizzleExecutor): Promise<DbShogoTitle[]> {
    const conn = tx ?? this.db;
    return conn.select().from(shogoTitles).orderBy(shogoTitles.sortOrder);
  }

  async insert(input: DbNewShogoTitle, tx?: DrizzleExecutor): Promise<DbShogoTitle> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(shogoTitles).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    code: string,
    patch: ShogoTitlePatch,
    tx?: DrizzleExecutor,
  ): Promise<DbShogoTitle | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(shogoTitles)
      .set(patch)
      .where(eq(shogoTitles.code, code))
      .returning();
    return rows[0] ?? null;
  }

  async delete(code: string, tx?: DrizzleExecutor): Promise<void> {
    const conn = tx ?? this.db;
    await conn.delete(shogoTitles).where(eq(shogoTitles.code, code));
  }

  /** Count history rows whose `shogo_title` matches this code. */
  async countHistoryUsingShogo(code: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(rankHistory)
      .where(eq(rankHistory.shogoTitle, code));
    return Number(rows[0]?.value ?? 0);
  }

  /** Count user profiles whose `shogo_title` matches this code (column added by Task 4). */
  async countProfilesUsingShogo(code: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(userProfile)
      .where(eq(userProfile.shogoTitle, code));
    return Number(rows[0]?.value ?? 0);
  }
}
