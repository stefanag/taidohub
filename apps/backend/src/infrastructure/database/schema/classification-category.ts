import {
  AnyPgColumn,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `classification_category` — taxonomy nodes used to classify techniques
 * (e.g. "Tachi-waza" → "Nage-waza"). The hierarchy is limited to a single
 * level (root → one layer of children) — a `BEFORE INSERT OR UPDATE` trigger
 * (defined in migration 0017) raises if `parent_id` itself has a parent.
 *
 * `(parent_id, code)` is uniquely indexed with NULLS NOT DISTINCT so root-level
 * codes (`parent_id IS NULL`) also collide on duplicate `code`.
 *
 * `parent_id` is `ON DELETE RESTRICT` so categories with children can't be
 * silently orphaned.
 */
export const classificationCategory = pgTable(
  'classification_category',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => classificationCategory.id, {
      onDelete: 'restrict',
    }),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    nameJa: text('name_ja').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    parentCodeUnique: unique('classification_category_parent_code_uniq')
      .on(table.parentId, table.code)
      .nullsNotDistinct(),
  }),
);

export type DbClassificationCategory = typeof classificationCategory.$inferSelect;
export type DbNewClassificationCategory = typeof classificationCategory.$inferInsert;
