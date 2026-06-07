import { relations } from 'drizzle-orm';
import {
  AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organisations } from './organisations.js';
import { user } from './users.js';

/**
 * `tag` — free-form keyword scoped to an organisation. `organisation_id` is
 * nullable to allow global tags (managed by sysadmins). Uniqueness on
 * `(organisation_id, name)` uses NULLS NOT DISTINCT so two global tags with
 * the same name collide just like two scoped ones do.
 */
export const tag = pgTable(
  'tag',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 80 }).notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueName: unique('tag_org_name_unique').on(table.organisationId, table.name).nullsNotDistinct(),
  }),
);

/**
 * `category` — hierarchical taxonomy node scoped to an organisation.
 * Self-referential `parent_id`; the strict-ladder rules (depth limits, cycle
 * prevention) are enforced in the service layer, not the database.
 * Uniqueness on `(organisation_id, parent_id, name)` uses NULLS NOT DISTINCT
 * so siblings with the same name collide even when both `organisation_id` and
 * `parent_id` are NULL.
 */
export const category = pgTable(
  'category',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    parentId: uuid('parent_id').references((): AnyPgColumn => category.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 80 }).notNull(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueName: unique('category_org_parent_name_unique')
      .on(table.organisationId, table.parentId, table.name)
      .nullsNotDistinct(),
  }),
);

/**
 * `tag_attachment` — polymorphic join between a tag and any target entity.
 * `target_id` is TEXT to accommodate both text user IDs and UUID-shaped
 * org/rank-history IDs. The reverse-lookup index supports "find all tags on
 * target X" queries.
 */
export const tagAttachment = pgTable(
  'tag_attachment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    attachedByUserId: text('attached_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    attachedAt: timestamp('attached_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueAttach: uniqueIndex('tag_attachment_unique').on(
      table.tagId,
      table.targetType,
      table.targetId,
    ),
    targetLookup: index('tag_attachment_target_idx').on(table.targetType, table.targetId),
  }),
);

/**
 * `category_attachment` — polymorphic join between a category and any target
 * entity. Same shape and rationale as `tag_attachment`.
 */
export const categoryAttachment = pgTable(
  'category_attachment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    attachedByUserId: text('attached_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    attachedAt: timestamp('attached_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueAttach: uniqueIndex('category_attachment_unique').on(
      table.categoryId,
      table.targetType,
      table.targetId,
    ),
    targetLookup: index('category_attachment_target_idx').on(table.targetType, table.targetId),
  }),
);

// Relations — optional but useful for typed joins in the service.
export const tagRelations = relations(tag, ({ many, one }) => ({
  attachments: many(tagAttachment),
  organisation: one(organisations, {
    fields: [tag.organisationId],
    references: [organisations.id],
  }),
}));

export const categoryRelations = relations(category, ({ many, one }) => ({
  attachments: many(categoryAttachment),
  children: many(category, { relationName: 'category_children' }),
  parent: one(category, {
    fields: [category.parentId],
    references: [category.id],
    relationName: 'category_children',
  }),
  organisation: one(organisations, {
    fields: [category.organisationId],
    references: [organisations.id],
  }),
}));

export const tagAttachmentRelations = relations(tagAttachment, ({ one }) => ({
  tag: one(tag, { fields: [tagAttachment.tagId], references: [tag.id] }),
}));

export const categoryAttachmentRelations = relations(categoryAttachment, ({ one }) => ({
  category: one(category, {
    fields: [categoryAttachment.categoryId],
    references: [category.id],
  }),
}));

export type DbTag = typeof tag.$inferSelect;
export type DbNewTag = typeof tag.$inferInsert;
export type DbCategory = typeof category.$inferSelect;
export type DbNewCategory = typeof category.$inferInsert;
export type DbTagAttachment = typeof tagAttachment.$inferSelect;
export type DbNewTagAttachment = typeof tagAttachment.$inferInsert;
export type DbCategoryAttachment = typeof categoryAttachment.$inferSelect;
export type DbNewCategoryAttachment = typeof categoryAttachment.$inferInsert;
