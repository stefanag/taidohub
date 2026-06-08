import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './users.js';

/**
 * `feature_flag` — registry of toggleable feature flags. One row per flag
 * code; `enabled` is the on/off switch flipped by sysadmins at runtime.
 *
 * The set of valid codes lives in `packages/contracts/src/feature-flags.ts`.
 * Adding a new code requires bumping the contract enum AND shipping a
 * migration that INSERTs the row with `ON CONFLICT DO NOTHING` so the row
 * exists for the lookup that backs the guard.
 *
 * `updated_by_id` is FK -> `user.id` with `ON DELETE SET NULL` so removing
 * the toggling sysadmin preserves the audit-trail row instead of cascading
 * the flag away.
 */
export const featureFlag = pgTable('feature_flag', {
  code: text('code').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedById: text('updated_by_id').references(() => user.id, {
    onDelete: 'set null',
  }),
});

export type DbFeatureFlag = typeof featureFlag.$inferSelect;
export type DbNewFeatureFlag = typeof featureFlag.$inferInsert;
