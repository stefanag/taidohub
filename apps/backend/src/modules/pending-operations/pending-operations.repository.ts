import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  type DbNewPendingOperation,
  type DbPendingOperation,
  pendingOperation,
  user,
} from '../../infrastructure/database/schema/index.js';

import type { PendingOperationStatus } from '@repo/contracts/pending-operations';

export type PendingOperationDecision = Pick<
  DbPendingOperation,
  'status' | 'resultEntityId' | 'error' | 'decidedAt'
>;

@Injectable()
export class PendingOperationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Runs `fn` in one transaction, so a decision and the write it allows commit together. */
  transaction<T>(fn: (tx: DrizzleExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async insert(values: DbNewPendingOperation, tx?: DrizzleExecutor): Promise<DbPendingOperation> {
    const [row] = await (tx ?? this.db).insert(pendingOperation).values(values).returning();
    return row!;
  }

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbPendingOperation | undefined> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(pendingOperation)
      .where(eq(pendingOperation.id, id))
      .limit(1);
    return row;
  }

  /**
   * Locks the row for the rest of the transaction, so two approvals of the
   * same operation cannot both see it as `pending`.
   */
  async findByIdForUpdate(id: string, tx: DrizzleExecutor): Promise<DbPendingOperation | undefined> {
    const [row] = await tx
      .select()
      .from(pendingOperation)
      .where(eq(pendingOperation.id, id))
      .limit(1)
      .for('update');
    return row;
  }

  async listByCreator(
    createdByUserId: string,
    status?: PendingOperationStatus,
  ): Promise<DbPendingOperation[]> {
    return this.db
      .select()
      .from(pendingOperation)
      .where(
        status
          ? and(eq(pendingOperation.createdByUserId, createdByUserId), eq(pendingOperation.status, status))
          : eq(pendingOperation.createdByUserId, createdByUserId),
      )
      .orderBy(desc(pendingOperation.createdAt));
  }

  async decide(
    id: string,
    decision: PendingOperationDecision,
    tx?: DrizzleExecutor,
  ): Promise<DbPendingOperation> {
    const [row] = await (tx ?? this.db)
      .update(pendingOperation)
      .set(decision)
      .where(eq(pendingOperation.id, id))
      .returning();
    return row!;
  }

  /** Display name of a user, for previews. */
  async findUserName(userId: string): Promise<string | null | undefined> {
    const [row] = await this.db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row ? row.name : undefined;
  }
}
