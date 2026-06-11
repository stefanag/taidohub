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
 * `pattern` — a named pattern (kata/hokei/kobo/...). Optionally owned by an
 * organisation (NULL for global / built-in patterns). `name_romaji` is the only
 * required name — every other localisation column defaults to ''. `min_rank_id`
 * is the lowest belt rank at which the pattern is taught/examined and is
 * nullable to allow rank-independent patterns. `official_body_org_id` is the
 * canonical/owning body for the pattern (e.g. WTF, ITF) and is nullable; if
 * that organisation is deleted, the pattern itself is preserved (SET NULL).
 */
export const pattern = pgTable('pattern', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdByOrganisationId: uuid('created_by_organisation_id').references(
    () => organisations.id,
    { onDelete: 'cascade' },
  ),
  createdByUserId: text('created_by_user_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  officialBodyOrgId: uuid('official_body_org_id').references(
    () => organisations.id,
    { onDelete: 'set null' },
  ),
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

export type DbPattern = typeof pattern.$inferSelect;
export type DbNewPattern = typeof pattern.$inferInsert;

/**
 * `pattern_classification` — many-to-many join between patterns and
 * classification categories. Composite PK `(pattern_id, classification_category_id)`
 * prevents duplicate edges. The reverse-lookup index supports "find all
 * patterns in this category" queries.
 *
 * `ON DELETE CASCADE` on `pattern_id` — deleting a pattern removes its
 * classifications. `ON DELETE RESTRICT` on `classification_category_id` — a
 * category that has patterns attached cannot be deleted; the service layer
 * must detach first.
 */
export const patternClassification = pgTable(
  'pattern_classification',
  {
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => pattern.id, { onDelete: 'cascade' }),
    classificationCategoryId: uuid('classification_category_id')
      .notNull()
      .references(() => classificationCategory.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.patternId, table.classificationCategoryId] }),
    categoryIdx: index('pattern_classification_category_idx').on(
      table.classificationCategoryId,
    ),
  }),
);

export type DbPatternClassification = typeof patternClassification.$inferSelect;
export type DbNewPatternClassification = typeof patternClassification.$inferInsert;
