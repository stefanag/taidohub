import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import {
  FEEDBACK_ENTITY_TYPES,
  FEEDBACK_REACTIONS,
} from '@repo/contracts/feedback';

import { user } from './users.js';

/**
 * Postgres ENUMs mirror the contract's `FEEDBACK_ENTITY_TYPES` and
 * `FEEDBACK_REACTIONS` constants. The alignment is asserted by a test in
 * the feedback module so contract and pgEnum can't drift independently.
 */
export const feedbackEntityType = pgEnum(
  'feedback_entity_type',
  FEEDBACK_ENTITY_TYPES as unknown as [string, ...string[]],
);

export const feedbackReactionType = pgEnum(
  'feedback_reaction_type',
  FEEDBACK_REACTIONS as unknown as [string, ...string[]],
);

/**
 * `feedback_thread` — conversation root. Threads are created on demand
 * when the first comment is posted; the unique index on
 * `(entity_type, entity_id, student_id)` makes the POST idempotent
 * (the server returns the existing row on a duplicate triple).
 *
 *   - `entity_id` is text rather than uuid because the entity it points
 *     at varies: a rank_history uuid for grading, a technique/pattern
 *     uuid, or — for `entity_type='general'` — the student's text user.id.
 *   - `student_id` and `created_by_user_id` are text to match better-auth's
 *     user.id type. ON DELETE CASCADE removes a user's threads when their
 *     account is deleted; that also takes their comments with them via
 *     the per-table cascade chain.
 */
export const feedbackThread = pgTable(
  'feedback_thread',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: feedbackEntityType('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    studentId: text('student_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /**
     * Nullable so deleting the user that started the thread doesn't take
     * the conversation with them (PG would refuse the delete otherwise,
     * given the FK's ON DELETE SET NULL). The contract still requires a
     * non-null value at create time; the service writes `actor.userId` on
     * insert and the column only goes null in the rare account-deletion
     * path.
     */
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    /** Thread identity — the unique key the controller upserts on. */
    entityStudentUnique: uniqueIndex('feedback_thread_entity_student_unique').on(
      table.entityType,
      table.entityId,
      table.studentId,
    ),
    studentIdx: index('feedback_thread_student_id_idx').on(table.studentId),
  }),
);

export type DbFeedbackThread = typeof feedbackThread.$inferSelect;
export type DbNewFeedbackThread = typeof feedbackThread.$inferInsert;

/**
 * `feedback_comment` — a comment within a thread.
 *
 *   - `parent_id` self-references for one-deep replies. ON DELETE RESTRICT
 *     so a hard DELETE of a parent that still has replies fails at the DB
 *     level. The service-level path uses soft delete (body='[deleted]',
 *     author_id='') in that case, leaving the row in place; only leaf
 *     comments are hard-deleted.
 *   - `author_id` is text (not nullable) so we can write `''` for the
 *     soft-delete marker without breaking the NOT NULL constraint. No FK
 *     so a vanished user doesn't break the comment chain.
 *   - `instructor_only` is forced to `false` server-side when the actor
 *     is the thread's student.
 */
export const feedbackComment = pgTable(
  'feedback_comment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => feedbackThread.id, { onDelete: 'cascade' }),
    authorId: text('author_id').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => feedbackComment.id, {
      onDelete: 'restrict',
    }),
    body: text('body').notNull(),
    instructorOnly: boolean('instructor_only').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    threadIdx: index('feedback_comment_thread_id_idx').on(table.threadId),
    parentIdx: index('feedback_comment_parent_id_idx').on(table.parentId),
    authorIdx: index('feedback_comment_author_id_idx').on(table.authorId),
    /**
     * Used by the unread-count query to compare `created_at` against a
     * per-user `last_read_at` cheaply.
     */
    createdAtIdx: index('feedback_comment_created_at_idx').on(table.createdAt),
  }),
);

export type DbFeedbackComment = typeof feedbackComment.$inferSelect;
export type DbNewFeedbackComment = typeof feedbackComment.$inferInsert;

/**
 * `feedback_reaction` — one row per (comment, user); the composite PK
 * enforces the at-most-one-reaction-per-user-per-comment rule. The
 * service-level PUT path is delete-then-insert so swapping reactions is
 * atomic and idempotent.
 */
export const feedbackReaction = pgTable(
  'feedback_reaction',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => feedbackComment.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reaction: feedbackReactionType('reaction').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.commentId, table.userId] }),
    commentIdx: index('feedback_reaction_comment_id_idx').on(table.commentId),
  }),
);

export type DbFeedbackReaction = typeof feedbackReaction.$inferSelect;
export type DbNewFeedbackReaction = typeof feedbackReaction.$inferInsert;

/**
 * `feedback_read_status` — per-(thread, user) last-read timestamp. The
 * composite PK keeps it a single-row upsert per user per thread. Drives
 * the unread-count badge: a comment is unread for a user when
 * `feedback_comment.created_at > feedback_read_status.last_read_at` (or
 * no read-status row exists for that pair).
 */
export const feedbackReadStatus = pgTable(
  'feedback_read_status',
  {
    threadId: uuid('thread_id')
      .notNull()
      .references(() => feedbackThread.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.userId] }),
  }),
);

export type DbFeedbackReadStatus = typeof feedbackReadStatus.$inferSelect;
export type DbNewFeedbackReadStatus = typeof feedbackReadStatus.$inferInsert;

// Silence the unused sql import warning when this module is built standalone
// (it's there in case a future migration needs raw SQL constraints).
void sql;
