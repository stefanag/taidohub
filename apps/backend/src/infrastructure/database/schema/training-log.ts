import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { user } from './users.js';

/**
 * A user's own training log and personal goals (self-registration plan,
 * phase 2). Private to the user; deleted with the account.
 */
export const trainingSessions = pgTable(
  'training_session',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    durationMinutes: integer('duration_minutes'),
    kind: text('kind', { enum: ['club', 'own', 'camp', 'seminar'] }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userDateIdx: index('training_session_user_date_idx').on(table.userId, table.date),
  }),
);

/**
 * Techniques and patterns practised in a session. `content_id` points at a
 * technique or a pattern depending on `content_type`; no foreign key, so a
 * removed catalogue item leaves the log entry intact (it is just not shown).
 */
export const trainingSessionItems = pgTable(
  'training_session_item',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    contentType: text('content_type', { enum: ['technique', 'pattern'] }).notNull(),
    contentId: uuid('content_id').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.contentType, table.contentId] }),
  }),
);

/** One row per user with goals; absent row = no goals. */
export const trainingGoals = pgTable('training_goal', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  targetRankId: uuid('target_rank_id').references(() => beltRanks.id, { onDelete: 'set null' }),
  targetDate: date('target_date', { mode: 'string' }),
  sessionsPerWeek: integer('sessions_per_week'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type DbTrainingSession = typeof trainingSessions.$inferSelect;
export type DbTrainingSessionItem = typeof trainingSessionItems.$inferSelect;
export type DbTrainingGoal = typeof trainingGoals.$inferSelect;
