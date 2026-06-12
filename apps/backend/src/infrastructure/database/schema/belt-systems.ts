import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * A family of belt ranks (Kyu, Dan, Mon). Always global — every rank that
 * needs an org-specific catalog points at one of these global systems and
 * scopes itself via `belt_ranks.organisation_id`.
 */
export const beltSystems = pgTable(
  'belt_systems',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('belt_systems_code_unique').on(table.code),
  }),
);

export type DbBeltSystem = typeof beltSystems.$inferSelect;
export type DbNewBeltSystem = typeof beltSystems.$inferInsert;
