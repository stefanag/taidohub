import { Inject, Injectable } from '@nestjs/common';
import type { ContentType } from '@repo/contracts/progress';
import { and, eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { userContentProgress } from '../../infrastructure/database/schema/user-content-progress.js';

export type ProgressRow = typeof userContentProgress.$inferSelect;
export type NewProgressRow = typeof userContentProgress.$inferInsert;

/**
 * Repository — single source of Drizzle access for the progress module.
 *
 * Mutating calls require a transaction handle so the row mutation and the
 * audit-log row commit together. Reads run against the root db handle, with
 * an optional executor so they can be re-used inside the upsert transaction.
 *
 * `findByUserAndContent` switches on `contentType` to pick the right FK
 * column. The DB-side partial unique indexes guarantee at most one row per
 * `(user, content)` pair, so `limit(1)` is exhaustive.
 */
@Injectable()
export class ProgressRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByUserAndContent(
    userId: string,
    contentType: ContentType,
    contentId: string,
    tx?: DrizzleExecutor,
  ): Promise<ProgressRow | null> {
    const executor = tx ?? this.db;
    const fkColumn =
      contentType === 'technique'
        ? userContentProgress.techniqueId
        : userContentProgress.patternId;
    const rows = await executor
      .select()
      .from(userContentProgress)
      .where(
        and(
          eq(userContentProgress.userId, userId),
          eq(fkColumn, contentId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listByUser(
    userId: string,
    contentType?: ContentType,
  ): Promise<ProgressRow[]> {
    const baseCondition = eq(userContentProgress.userId, userId);
    const condition = contentType
      ? and(baseCondition, eq(userContentProgress.contentType, contentType))
      : baseCondition;
    return this.db
      .select()
      .from(userContentProgress)
      .where(condition);
  }

  async insert(
    input: NewProgressRow,
    tx: DrizzleExecutor,
  ): Promise<ProgressRow> {
    const [row] = await tx
      .insert(userContentProgress)
      .values(input)
      .returning();
    if (!row) throw new Error('Failed to insert progress row');
    return row;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<ProgressRow, 'status' | 'notes' | 'lastPracticedAt' | 'updatedAt'>
    >,
    tx: DrizzleExecutor,
  ): Promise<ProgressRow> {
    const [row] = await tx
      .update(userContentProgress)
      .set(patch)
      .where(eq(userContentProgress.id, id))
      .returning();
    if (!row) throw new Error(`Progress ${id} not found during update`);
    return row;
  }

  async delete(id: string, tx: DrizzleExecutor): Promise<void> {
    await tx.delete(userContentProgress).where(eq(userContentProgress.id, id));
  }
}
