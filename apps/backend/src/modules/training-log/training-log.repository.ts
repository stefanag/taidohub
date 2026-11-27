import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  type DbTrainingGoal,
  type DbTrainingSession,
  type DbTrainingSessionItem,
  trainingGoals,
  trainingSessionItems,
  trainingSessions,
} from '../../infrastructure/database/schema/training-log.js';

export type TrainingSessionRow = DbTrainingSession & { items: DbTrainingSessionItem[] };

export type TrainingSessionFields = Pick<
  DbTrainingSession,
  'date' | 'durationMinutes' | 'kind' | 'notes'
>;
export type TrainingSessionItemFields = Pick<DbTrainingSessionItem, 'contentType' | 'contentId'>;
export type TrainingGoalFields = Pick<
  DbTrainingGoal,
  'targetRankId' | 'targetDate' | 'sessionsPerWeek'
>;

/** The only file in the training-log module that touches Drizzle. */
@Injectable()
export class TrainingLogRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  transaction<T>(fn: (tx: DrizzleExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async listByUser(
    userId: string,
    range: { from?: string | undefined; to?: string | undefined },
  ): Promise<TrainingSessionRow[]> {
    const conditions: SQL[] = [eq(trainingSessions.userId, userId)];
    if (range.from) conditions.push(gte(trainingSessions.date, range.from));
    if (range.to) conditions.push(lte(trainingSessions.date, range.to));
    const sessions = await this.db
      .select()
      .from(trainingSessions)
      .where(and(...conditions))
      .orderBy(desc(trainingSessions.date), desc(trainingSessions.createdAt));
    return this.withItems(sessions, this.db);
  }

  async findById(id: string, tx: DrizzleExecutor = this.db): Promise<TrainingSessionRow | null> {
    const [session] = await tx.select().from(trainingSessions).where(eq(trainingSessions.id, id));
    if (!session) return null;
    const [row] = await this.withItems([session], tx);
    return row ?? null;
  }

  async insert(
    userId: string,
    fields: TrainingSessionFields,
    items: TrainingSessionItemFields[],
    tx: DrizzleExecutor,
  ): Promise<string> {
    const [row] = await tx
      .insert(trainingSessions)
      .values({ userId, ...fields })
      .returning({ id: trainingSessions.id });
    await this.insertItems(row!.id, items, tx);
    return row!.id;
  }

  async replace(
    id: string,
    fields: TrainingSessionFields,
    items: TrainingSessionItemFields[],
    tx: DrizzleExecutor,
  ): Promise<void> {
    await tx
      .update(trainingSessions)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(trainingSessions.id, id));
    await tx.delete(trainingSessionItems).where(eq(trainingSessionItems.sessionId, id));
    await this.insertItems(id, items, tx);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(trainingSessions).where(eq(trainingSessions.id, id));
  }

  async findGoal(userId: string): Promise<DbTrainingGoal | null> {
    const [row] = await this.db
      .select()
      .from(trainingGoals)
      .where(eq(trainingGoals.userId, userId));
    return row ?? null;
  }

  async upsertGoal(userId: string, fields: TrainingGoalFields): Promise<DbTrainingGoal> {
    const values = { ...fields, updatedAt: new Date() };
    const [row] = await this.db
      .insert(trainingGoals)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: trainingGoals.userId, set: values })
      .returning();
    return row!;
  }

  private async insertItems(
    sessionId: string,
    items: TrainingSessionItemFields[],
    tx: DrizzleExecutor,
  ): Promise<void> {
    if (items.length === 0) return;
    await tx
      .insert(trainingSessionItems)
      .values(items.map((item) => ({ sessionId, ...item })))
      .onConflictDoNothing();
  }

  private async withItems(
    sessions: DbTrainingSession[],
    tx: DrizzleExecutor,
  ): Promise<TrainingSessionRow[]> {
    if (sessions.length === 0) return [];
    const items = await tx
      .select()
      .from(trainingSessionItems)
      .where(
        inArray(
          trainingSessionItems.sessionId,
          sessions.map((s) => s.id),
        ),
      );
    return sessions.map((s) => ({ ...s, items: items.filter((i) => i.sessionId === s.id) }));
  }
}
