import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { classificationCategory } from './classification-category.js';
import { organisations } from './organisations.js';
import { user } from './users.js';

/**
 * `technique` — a named technique (waza). Optionally owned by an organisation
 * (NULL for global / built-in techniques). `name_romaji` is the only required
 * name — every other localisation column defaults to ''. `min_rank_id` is the
 * lowest belt rank at which the technique is taught/examined and is nullable
 * to allow rank-independent techniques (kihon etc.).
 */
export const technique = pgTable('technique', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdByOrganisationId: uuid('created_by_organisation_id').references(
    () => organisations.id,
    { onDelete: 'cascade' },
  ),
  createdByUserId: text('created_by_user_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  isKihon: boolean('is_kihon').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  minRankId: uuid('min_rank_id').references(() => beltRanks.id, {
    onDelete: 'set null',
  }),
  nameJa: text('name_ja').notNull().default(''),
  nameRomaji: text('name_romaji').notNull(),
  nameSv: text('name_sv').notNull().default(''),
  nameEn: text('name_en').notNull().default(''),
  nameFi: text('name_fi').notNull().default(''),
  descriptionSv: text('description_sv').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  descriptionFi: text('description_fi').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type DbTechnique = typeof technique.$inferSelect;
export type DbNewTechnique = typeof technique.$inferInsert;

/**
 * `technique_classification` — many-to-many join between techniques and
 * classification categories. Composite PK `(technique_id, classification_category_id)`
 * prevents duplicate edges. The reverse-lookup index supports "find all
 * techniques in this category" queries.
 *
 * `ON DELETE CASCADE` on `technique_id` — deleting a technique removes its
 * classifications. `ON DELETE RESTRICT` on `classification_category_id` — a
 * category that has techniques attached cannot be deleted; the service layer
 * must detach first.
 */
export const techniqueClassification = pgTable(
  'technique_classification',
  {
    techniqueId: uuid('technique_id')
      .notNull()
      .references(() => technique.id, { onDelete: 'cascade' }),
    classificationCategoryId: uuid('classification_category_id')
      .notNull()
      .references(() => classificationCategory.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.techniqueId, table.classificationCategoryId] }),
    categoryIdx: index('technique_classification_category_idx').on(
      table.classificationCategoryId,
    ),
  }),
);

export type DbTechniqueClassification = typeof techniqueClassification.$inferSelect;
export type DbNewTechniqueClassification = typeof techniqueClassification.$inferInsert;
