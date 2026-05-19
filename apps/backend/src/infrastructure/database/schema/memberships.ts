import { MembershipRoleSchema } from '@repo/contracts/memberships';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  text,
} from 'drizzle-orm/pg-core';

import { organisations } from './organisations.js';
import { user } from './users.js';

/**
 * Postgres ENUM type for the membership `role` column. Values come straight
 * from `MembershipRoleSchema.options` in `@repo/contracts/memberships` so the
 * contract and the DB stay in lock-step. `role-enum-alignment.spec.ts`
 * asserts the agreement.
 */
export const membershipRole = pgEnum(
  'membership_role',
  MembershipRoleSchema.options as [string, ...string[]],
);

export const organisationMembership = pgTable(
  'organisation_membership',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userOrgRoleUnique: uniqueIndex('organisation_membership_user_org_role_unique').on(
      table.userId,
      table.organisationId,
      table.role,
    ),
    userIdx: index('organisation_membership_user_id_idx').on(table.userId),
    orgIdx: index('organisation_membership_organisation_id_idx').on(table.organisationId),
  }),
);

export type DbOrganisationMembership = typeof organisationMembership.$inferSelect;
export type DbNewOrganisationMembership = typeof organisationMembership.$inferInsert;
