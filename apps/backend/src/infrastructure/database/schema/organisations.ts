import { AnyPgColumn, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './users.js';

/**
 * `organisations` — federation/club hierarchy. Self-referential parent_id;
 * the strict-ladder rules (IF → null, NF → IF, club → NF|club) are enforced
 * in the service layer, not the database.
 */
export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => organisations.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['international_federation', 'national_federation', 'club'] }).notNull(),
    shortCode: text('short_code').notNull(),
    slug: text('slug'),
    country: text('country'),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    nameJa: text('name_ja'),
    logoUrl: text('logo_url'),
    address: text('address'),
    contactEmail: text('contact_email'),
    headInstructorId: text('head_instructor_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    parentIdx: index('organisations_parent_id_idx').on(table.parentId),
    typeIdx: index('organisations_type_idx').on(table.type),
    countryIdx: index('organisations_country_idx').on(table.country),
    headInstructorIdx: index('organisations_head_instructor_id_idx').on(table.headInstructorId),
    slugUnique: uniqueIndex('organisations_slug_unique').on(table.slug),
    shortCodeUnique: uniqueIndex('organisations_short_code_country_type_unique').on(
      table.country,
      table.type,
      table.shortCode,
    ),
  }),
);

export type DbOrganisation = typeof organisations.$inferSelect;
export type DbNewOrganisation = typeof organisations.$inferInsert;
