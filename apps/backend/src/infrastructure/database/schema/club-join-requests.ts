import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organisations } from './organisations.js';
import { user } from './users.js';

/**
 * A request from a user without a club to join one (self-registration plan,
 * phase 3). Approving it creates a student membership. At most one pending
 * request per user.
 */
export const clubJoinRequests = pgTable(
  'club_join_request',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'approved', 'declined', 'cancelled'] })
      .notNull()
      .default('pending'),
    message: text('message'),
    decidedById: text('decided_by_id').references(() => user.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    onePendingPerUser: uniqueIndex('club_join_request_one_pending_per_user')
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    orgStatusIdx: index('club_join_request_org_status_idx').on(table.organisationId, table.status),
  }),
);

export type DbClubJoinRequest = typeof clubJoinRequests.$inferSelect;
