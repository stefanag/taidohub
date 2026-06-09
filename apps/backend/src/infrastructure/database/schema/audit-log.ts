import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './users.js';

/**
 * `audit_log` — append-only record of every admin-gated mutation.
 *
 * `before`/`after` are `jsonb` snapshots of the API-shape row (not the raw
 * DB row), so a `select * from audit_log` gives consumers something they
 * can re-feed into the corresponding `*Schema` without translation.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action', {
      enum: [
        'create',
        'update',
        'delete',
        'move',
        'deactivate',
        'reactivate',
        'password_reset_triggered',
      ],
    }).notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    impersonatedById: text('impersonated_by_id').references(() => user.id, { onDelete: 'set null' }),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index('audit_log_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    userIdx: index('audit_log_user_id_idx').on(table.userId, table.createdAt),
    createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
  }),
);

export type DbAuditLog = typeof auditLog.$inferSelect;
export type DbNewAuditLog = typeof auditLog.$inferInsert;
