import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organisations } from './organisations.js';
import { user } from './users.js';

/**
 * Terms of use and privacy notices, owned by the platform (`organisation_id`
 * null) or by a federation or club. See
 * docs/superpowers/plans/2026-11-26-legal-documents.md.
 *
 * Evidence matters here: published versions and the acknowledgement log are
 * never rewritten, and content hashes are computed when a translation is
 * written (jsonb reorders object keys, so hashing on read would not be stable).
 */
export const legalDocuments = pgTable(
  'legal_document',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind', { enum: ['terms', 'privacy', 'dpa'] }).notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'restrict',
    }),
    audience: text('audience', {
      enum: ['members', 'self_registered', 'organisations'],
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    // One document per kind and audience per owner; the platform's rows have
    // a null organisation_id, hence NULLS NOT DISTINCT.
    ownerKindAudienceUnique: unique('legal_document_owner_kind_audience_unique')
      .on(table.kind, table.organisationId, table.audience)
      .nullsNotDistinct(),
    organisationIdx: index('legal_document_organisation_id_idx').on(table.organisationId),
  }),
);

export const legalDocumentVersions = pgTable(
  'legal_document_version',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => legalDocuments.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    status: text('status', { enum: ['draft', 'published', 'retired'] }).notNull(),
    /** The legally binding language; it takes precedence over translations. */
    authoritativeLocale: text('authoritative_locale').notNull(),
    requiresReacceptance: boolean('requires_reacceptance').notNull().default(false),
    changeSummary: text('change_summary'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    publishedByUserId: text('published_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    documentVersionUnique: uniqueIndex('legal_document_version_document_version_unique').on(
      table.documentId,
      table.version,
    ),
    // At most one draft and one published version per document.
    oneDraft: uniqueIndex('legal_document_version_one_draft')
      .on(table.documentId)
      .where(sql`${table.status} = 'draft'`),
    onePublished: uniqueIndex('legal_document_version_one_published')
      .on(table.documentId)
      .where(sql`${table.status} = 'published'`),
  }),
);

export const legalDocumentTranslations = pgTable(
  'legal_document_translation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => legalDocumentVersions.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    /** 1 while the version is a draft; each correction after publishing adds one. */
    revision: integer('revision').notNull(),
    title: text('title').notNull(),
    /** Quill Delta, same format as the profile's "About me". */
    body: jsonb('body').$type<{ ops: unknown[] }>().notNull(),
    /** sha256 of the canonical JSON of { title, body }. */
    contentHash: text('content_hash').notNull(),
    /** Copied from the previous version and not yet reviewed: never shown to users. */
    needsReview: boolean('needs_review').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    versionLocaleRevisionUnique: uniqueIndex(
      'legal_document_translation_version_locale_revision_unique',
    ).on(table.versionId, table.locale, table.revision),
  }),
);

/** Append-only: what a user accepted (terms) or received (privacy notices). */
export const userDocumentAcknowledgements = pgTable(
  'user_document_acknowledgement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => legalDocumentVersions.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['accepted', 'received'] }).notNull(),
    displayedLocale: text('displayed_locale').notNull(),
    displayedTranslationRevision: integer('displayed_translation_revision').notNull(),
    displayedContentHash: text('displayed_content_hash').notNull(),
    authoritativeLocale: text('authoritative_locale').notNull(),
    authoritativeContentHash: text('authoritative_content_hash').notNull(),
    context: text('context', {
      enum: ['registration', 'invitation', 'club_join', 'new_version'],
    }).notNull(),
    /** The organisation whose text this was; null for platform texts. */
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'set null',
    }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userVersionUnique: uniqueIndex('user_document_acknowledgement_user_version_unique').on(
      table.userId,
      table.versionId,
    ),
  }),
);

export type DbLegalDocument = typeof legalDocuments.$inferSelect;
export type DbLegalDocumentVersion = typeof legalDocumentVersions.$inferSelect;
export type DbLegalDocumentTranslation = typeof legalDocumentTranslations.$inferSelect;
export type DbUserDocumentAcknowledgement = typeof userDocumentAcknowledgements.$inferSelect;
