import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

export const rankGradingRequirement = pgTable(
  'rank_grading_requirement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    jissenMinutes: integer('jissen_minutes'),
    jissenTested: boolean('jissen_tested').notNull().default(false),
    minMonthsSincePreviousRank: integer('min_months_since_previous_rank'),
    requiresTheoricExam: boolean('requires_theoric_exam').notNull().default(false),
    requiresEssay: boolean('requires_essay').notNull().default(false),
  },
  (t) => ({
    byScope: uniqueIndex('rank_grading_requirement_by_scope_idx').on(t.rankId, t.setId),
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
