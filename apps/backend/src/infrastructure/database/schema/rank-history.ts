import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { rankRequirementAgeGroup, requirementSet } from './grading-requirements.js';
import { shogoTitles } from './shogo-titles.js';
import { user } from './users.js';

export const rankHistoryResult = pgEnum('rank_history_result', ['pass', 'fail']);
export const rankHistorySource = pgEnum('rank_history_source', ['event', 'external']);

/**
 * The unified log of every grading. `event_id` is a uuid with no FK constraint
 * in v1 (the `grading_events` table does not exist yet — followup D1); the
 * partial unique index still prevents double-mirroring an event for the same
 * user. Two CHECK constraints encode the source/event-id consistency and the
 * verification-triple atomicity invariants from spec §4.4.
 */
export const rankHistory = pgTable(
  'rank_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'restrict' }),
    shogoTitle: text('shogo_title').references(() => shogoTitles.code, {
      onDelete: 'restrict',
    }),
    date: date('date', { mode: 'string' }).notNull(),
    result: rankHistoryResult('result').notNull(),
    source: rankHistorySource('source').notNull(),
    // No FK constraint at v1; added by followup D1 when grading_events ships.
    eventId: uuid('event_id'),
    recordedByUserId: text('recorded_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    examinerName: text('examiner_name'),
    organisationName: text('organisation_name'),
    notes: text('notes'),
    verified: boolean('verified').notNull().default(false),
    verifiedByUserId: text('verified_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // Which requirement a verified grading was judged against, snapshotted at
    // verification (plan 2026-11-28-age-based-grading-requirements). The ids
    // may go null when the set or group is deleted; the rest stays.
    judgedSetId: uuid('judged_set_id').references(() => requirementSet.id, { onDelete: 'set null' }),
    judgedSetName: text('judged_set_name'),
    judgedAgeGroupId: uuid('judged_age_group_id').references(() => rankRequirementAgeGroup.id, {
      onDelete: 'set null',
    }),
    judgedAgeFrom: integer('judged_age_from'),
    judgedAgeTo: integer('judged_age_to'),
    judgedAgeBasis: text('judged_age_basis', { enum: ['age_on_grading_date', 'age_reached_in_grading_year'] }),
  },
  (table) => ({
    eventUserUnique: uniqueIndex('rank_history_event_id_user_id_unique')
      .on(table.eventId, table.userId)
      .where(sql`${table.eventId} IS NOT NULL`),
    userDateIdx: index('rank_history_user_id_date_idx').on(table.userId, table.date),
    rankIdx: index('rank_history_rank_id_idx').on(table.rankId),
    verifiedIdx: index('rank_history_verified_idx').on(table.verified),
    sourceEventConsistency: check(
      'rank_history_source_event_consistency',
      sql`(${table.source} = 'event' AND ${table.eventId} IS NOT NULL)
          OR (${table.source} = 'external' AND ${table.eventId} IS NULL)`,
    ),
    verifiedTripleConsistency: check(
      'rank_history_verified_triple_consistency',
      sql`(${table.verified} = false AND ${table.verifiedByUserId} IS NULL AND ${table.verifiedAt} IS NULL)
          OR (${table.verified} = true AND ${table.verifiedByUserId} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL)`,
    ),
  }),
);

export type DbRankHistory = typeof rankHistory.$inferSelect;
export type DbNewRankHistory = typeof rankHistory.$inferInsert;
