import { numeric, pgTable, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * `stat_current` — the live, always-up-to-date statistics table. Rows are
 * maintained by triggers on `rank_history`, `organisation_membership`, and
 * `user_content_progress` (see migration `0033_statistics_triggers.sql`),
 * plus the `rebuild_all()` SQL function for full recomputation.
 *
 * This Drizzle definition is SELECT/type-inference only: the primary key,
 * indexes, triggers, and helper functions all live in raw SQL in the
 * migration — drizzle-kit does not manage triggers, so this file must not
 * be used to (re)generate that migration.
 */
export const statCurrent = pgTable(
  'stat_current',
  {
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    metric: text('metric').notNull(),
    dimensionKey: text('dimension_key').notNull().default(''),
    value: numeric('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scopeType, t.scopeId, t.metric, t.dimensionKey] }),
  }),
);

/**
 * `stat_snapshot_monthly` — monthly point-in-time snapshots of statistics,
 * keyed additionally by (year, month). Populated by a future scheduled job
 * (not part of this task); the table + indexes ship now so later tasks can
 * write to it without another migration.
 */
export const statSnapshotMonthly = pgTable(
  'stat_snapshot_monthly',
  {
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    metric: text('metric').notNull(),
    dimensionKey: text('dimension_key').notNull().default(''),
    year: smallint('year').notNull(),
    month: smallint('month').notNull(),
    value: numeric('value').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scopeType, t.scopeId, t.metric, t.dimensionKey, t.year, t.month] }),
  }),
);

export type DbStatCurrent = typeof statCurrent.$inferSelect;
export type DbStatSnapshotMonthly = typeof statSnapshotMonthly.$inferSelect;
