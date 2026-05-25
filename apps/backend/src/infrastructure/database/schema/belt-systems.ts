import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organisations } from './organisations.js';

/**
 * A family of belt ranks (Kyu, Dan, Mon). `organisation_id` NULL means the
 * system is global; non-null means it is private to that organisation. The
 * unique index lets two organisations both define their own `kyu` system.
 */
export const beltSystems = pgTable(
  'belt_systems',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgCodeUnique: uniqueIndex('belt_systems_organisation_id_code_unique').on(
      table.organisationId,
      table.code,
    ),
    orgIdx: index('belt_systems_organisation_id_idx').on(table.organisationId),
  }),
);

export type DbBeltSystem = typeof beltSystems.$inferSelect;
export type DbNewBeltSystem = typeof beltSystems.$inferInsert;
