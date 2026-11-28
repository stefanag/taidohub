import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { organisations } from './organisations.js';
import { pattern } from './pattern.js';
import { technique } from './technique.js';

export const requirementSet = pgTable(
  'requirement_set',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    effectiveDate: date('effective_date').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    clonedFromId: uuid('cloned_from_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byOrg: index('requirement_set_by_org_idx').on(t.organisationId),
  }),
);

/**
 * An age group of one kyu or dan rank in one requirement set. Both bounds are
 * inclusive; null means unbounded on that side. Each group has exactly one
 * variant: requirement rows with this `age_group_id`, replacing the base
 * requirement (`age_group_id IS NULL`) for students in the group. Groups of
 * the same (rank, set) must not overlap (checked in the service). See
 * docs/superpowers/plans/2026-11-28-age-based-grading-requirements.md.
 */
export const rankRequirementAgeGroup = pgTable(
  'rank_requirement_age_group',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    ageFrom: integer('age_from'),
    ageTo: integer('age_to'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    byScope: index('rank_requirement_age_group_by_scope_idx').on(t.rankId, t.setId),
    hasBound: check('rank_requirement_age_group_has_bound', sql`${t.ageFrom} IS NOT NULL OR ${t.ageTo} IS NOT NULL`),
    ordered: check(
      'rank_requirement_age_group_ordered',
      sql`${t.ageFrom} IS NULL OR ${t.ageTo} IS NULL OR ${t.ageFrom} <= ${t.ageTo}`,
    ),
  }),
);

export const rankGradingRequirement = pgTable(
  'rank_grading_requirement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    ageGroupId: uuid('age_group_id').references(() => rankRequirementAgeGroup.id, { onDelete: 'cascade' }),
    jissenMinutes: integer('jissen_minutes'),
    jissenTested: boolean('jissen_tested').notNull().default(false),
    minMonthsSincePreviousRank: integer('min_months_since_previous_rank'),
    requiresTheoricExam: boolean('requires_theoric_exam').notNull().default(false),
    requiresEssay: boolean('requires_essay').notNull().default(false),
  },
  (t) => ({
    // NULLS NOT DISTINCT: one base requirement (age_group_id NULL) per
    // (rank, set), and the global set (set_id NULL) is unique too.
    byScope: unique('rank_grading_requirement_by_scope')
      .on(t.rankId, t.setId, t.ageGroupId)
      .nullsNotDistinct(),
  }),
);

export const rankRequirementTechnique = pgTable(
  'rank_requirement_technique',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    ageGroupId: uuid('age_group_id').references(() => rankRequirementAgeGroup.id, { onDelete: 'cascade' }),
    techniqueId: uuid('technique_id')
      .notNull()
      .references(() => technique.id, { onDelete: 'cascade' }),
    isTested: boolean('is_tested').notNull().default(false),
  },
  (t) => ({
    byScope: index('rank_requirement_technique_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementPattern = pgTable(
  'rank_requirement_pattern',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    ageGroupId: uuid('age_group_id').references(() => rankRequirementAgeGroup.id, { onDelete: 'cascade' }),
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => pattern.id, { onDelete: 'cascade' }),
    isTested: boolean('is_tested').notNull().default(false),
  },
  (t) => ({
    byScope: index('rank_requirement_pattern_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementHokeiGroup = pgTable(
  'rank_requirement_hokei_group',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    ageGroupId: uuid('age_group_id').references(() => rankRequirementAgeGroup.id, { onDelete: 'cascade' }),
    groupOrder: integer('group_order').notNull().default(0),
    pickCount: integer('pick_count').notNull().default(1),
    isTested: boolean('is_tested').notNull().default(false),
    labelEn: text('label_en'),
    labelFi: text('label_fi'),
    labelSv: text('label_sv'),
  },
  (t) => ({
    byScope: index('rank_requirement_hokei_group_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementHokeiGroupPattern = pgTable(
  'rank_requirement_hokei_group_pattern',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => rankRequirementHokeiGroup.id, { onDelete: 'cascade' }),
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => pattern.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.patternId] }),
  }),
);
