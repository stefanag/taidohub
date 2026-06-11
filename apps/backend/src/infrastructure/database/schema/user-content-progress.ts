import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { pattern } from './pattern.js';
import { technique } from './technique.js';
import { user } from './users.js';

/**
 * `user_content_progress` — per-user practice/learning progress on a piece of
 * content (a technique or a pattern). The polymorphic association is enforced
 * by a CHECK constraint (defined in migration 0021):
 *
 *   - `content_type = 'technique'` ⇒ `technique_id IS NOT NULL`, `pattern_id IS NULL`
 *   - `content_type = 'pattern'`   ⇒ `pattern_id   IS NOT NULL`, `technique_id IS NULL`
 *
 * `status` is constrained to the practice-progression enum via a separate
 * CHECK (also hand-added in 0021), kept here next to the table so the
 * constraint and the contract enum are easy to read side-by-side.
 *
 * The two partial unique indexes guarantee one progress row per `(user,
 * content)` pair: `userTechniqueUniq` is enforced only when `technique_id IS
 * NOT NULL`; `userPatternUniq` only when `pattern_id IS NOT NULL`. Because
 * each row's polymorphic CHECK forces exactly one of the two FKs to be set,
 * the two partial indexes together cover every row exactly once.
 *
 * `last_practiced_at` is a SQL `date` column (calendar day, no time).
 *
 * FK behaviour: deleting a user cascades to their progress rows; deleting a
 * technique or pattern cascades to the progress rows referencing it.
 */
export const userContentProgress = pgTable(
  'user_content_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    techniqueId: uuid('technique_id').references(() => technique.id, {
      onDelete: 'cascade',
    }),
    patternId: uuid('pattern_id').references(() => pattern.id, {
      onDelete: 'cascade',
    }),
    status: text('status').notNull(),
    notes: text('notes').notNull().default(''),
    lastPracticedAt: date('last_practiced_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index('user_content_progress_user_idx').on(table.userId),
    // Partial unique indexes — one progress row per user per content item.
    // If drizzle-kit does not emit the `WHERE` clause in the generated SQL,
    // the migration must be hand-edited to add it.
    userTechniqueUniq: uniqueIndex('user_content_progress_user_technique_uniq')
      .on(table.userId, table.techniqueId)
      .where(sql`${table.techniqueId} IS NOT NULL`),
    userPatternUniq: uniqueIndex('user_content_progress_user_pattern_uniq')
      .on(table.userId, table.patternId)
      .where(sql`${table.patternId} IS NOT NULL`),
  }),
);

export type DbUserContentProgress = typeof userContentProgress.$inferSelect;
export type DbNewUserContentProgress = typeof userContentProgress.$inferInsert;
