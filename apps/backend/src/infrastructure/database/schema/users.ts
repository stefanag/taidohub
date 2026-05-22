import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * better-auth's required tables. Names and columns match the official
 * better-auth Drizzle adapter expectations exactly — better-auth introspects
 * by table name so renaming any of these will silently break auth.
 *
 * Reference: https://www.better-auth.com/docs/adapters/drizzle
 */

/**
 * The values the `role` column accepts. Kept here next to the table so the
 * CHECK constraint and the contract enum (`RoleSchema` in `@repo/contracts`)
 * are easy to read side-by-side. Adding a value requires updating both
 * places + the migration; the alignment test in
 * `apps/backend/src/modules/memberships/role-enum-alignment.spec.ts` guards
 * the agreement.
 */
export const USER_ROLES = ['sysadmin', 'user'] as const;

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    role: text('role').notNull().default('user'),
    locale: text('locale').notNull().default('en'),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userRoleCheck: check(
      'user_role_check',
      sql`${table.role} IN ('sysadmin', 'user')`,
    ),
  }),
);

// session, account, verification — unchanged.
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
    withTimezone: true,
    mode: 'date',
  }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
    withTimezone: true,
    mode: 'date',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  // Unique: one-time tokens are looked up by `value`; the constraint both
  // makes that lookup an index seek and guarantees a value maps to one row.
  value: text('value').notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const users = user;

export type DbUser = typeof user.$inferSelect;
