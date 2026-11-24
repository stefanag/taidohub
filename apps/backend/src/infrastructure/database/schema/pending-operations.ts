import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './users.js';

/**
 * `pending_operation` — a write proposed by an AI client over MCP.
 *
 * Nothing is written to the target table when the row is created. The user
 * who proposed it approves it in the web app; approval re-runs the owning
 * service's checks and performs the write in the same transaction that marks
 * the row `approved`. See `modules/pending-operations/`.
 *
 * `params` is the validated proposal input and `preview` the readable facts
 * resolved when it was proposed; both are API-shaped JSON, parsed back
 * through `@repo/contracts/pending-operations` on read.
 */
export const pendingOperation = pgTable(
  'pending_operation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type', { enum: ['rank_history.create'] }).notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'failed'] })
      .notNull()
      .default('pending'),
    params: jsonb('params').notNull(),
    preview: jsonb('preview').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdVia: text('created_via', { enum: ['mcp'] }).notNull(),
    resultEntityId: uuid('result_entity_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    creatorStatusIdx: index('pending_operation_creator_status_idx').on(
      table.createdByUserId,
      table.status,
      table.createdAt,
    ),
  }),
);

export type DbPendingOperation = typeof pendingOperation.$inferSelect;
export type DbNewPendingOperation = typeof pendingOperation.$inferInsert;
