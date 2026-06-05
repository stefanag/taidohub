import { date, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { shogoTitles } from './shogo-titles.js';
import { user } from './users.js';

/**
 * A 1:1 extension of the better-auth `user` table. `user_id` is both the
 * primary key (enforcing the 1:1 relationship) and an FK to `user(id)` with
 * `on delete cascade` — deleting a user removes their profile.
 *
 * `date_of_birth` / `taido_start_date` are SQL `date` columns (calendar
 * dates, no time component). `citizenships` is a Postgres `text[]` column,
 * NOT NULL with an empty-array default — every user has a (possibly empty)
 * list, never null.
 */
export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  dateOfBirth: date('date_of_birth', { mode: 'string' }),
  taidoStartDate: date('taido_start_date', { mode: 'string' }),
  addressStreet: text('address_street'),
  addressPostalCode: text('address_postal_code'),
  addressCity: text('address_city'),
  addressCountry: text('address_country'),
  citizenships: text('citizenships').array().notNull().default([]),
  shogoTitle: text('shogo_title').references(() => shogoTitles.code, {
    onDelete: 'set null',
  }),
  aboutMe: jsonb('about_me').$type<{ ops: unknown[] } | null>(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type DbUserProfile = typeof userProfile.$inferSelect;
export type DbNewUserProfile = typeof userProfile.$inferInsert;
