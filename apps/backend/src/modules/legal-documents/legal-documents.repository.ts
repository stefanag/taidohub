import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  type DbLegalDocument,
  type DbLegalDocumentTranslation,
  type DbLegalDocumentVersion,
  legalDocuments,
  legalDocumentTranslations,
  legalDocumentVersions,
  userDocumentAcknowledgements,
} from '../../infrastructure/database/schema/index.js';

export type LegalDocumentKind = DbLegalDocument['kind'];
export type LegalAudience = DbLegalDocument['audience'];

export type NewAcknowledgement = typeof userDocumentAcknowledgements.$inferInsert;

/** The only file in the legal-documents module that touches Drizzle. */
@Injectable()
export class LegalDocumentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  transaction<T>(fn: (tx: DrizzleExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  // ── Documents ──────────────────────────────────────────────────────────

  async findDocument(id: string): Promise<DbLegalDocument | null> {
    const rows = await this.db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async listDocuments(organisationId: string | null): Promise<DbLegalDocument[]> {
    return this.db
      .select()
      .from(legalDocuments)
      .where(
        organisationId === null
          ? isNull(legalDocuments.organisationId)
          : eq(legalDocuments.organisationId, organisationId),
      )
      .orderBy(legalDocuments.kind, legalDocuments.audience);
  }

  async findDocumentByKey(
    kind: LegalDocumentKind,
    organisationId: string | null,
    audience: LegalAudience,
  ): Promise<DbLegalDocument | null> {
    const rows = await this.db
      .select()
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.kind, kind),
          eq(legalDocuments.audience, audience),
          organisationId === null
            ? isNull(legalDocuments.organisationId)
            : eq(legalDocuments.organisationId, organisationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async insertDocument(
    tx: DrizzleExecutor,
    values: typeof legalDocuments.$inferInsert,
  ): Promise<DbLegalDocument> {
    const [row] = await tx.insert(legalDocuments).values(values).returning();
    return row!;
  }

  // ── Versions ───────────────────────────────────────────────────────────

  async findVersion(
    id: string,
    tx: DrizzleExecutor = this.db,
  ): Promise<DbLegalDocumentVersion | null> {
    const rows = await tx
      .select()
      .from(legalDocumentVersions)
      .where(eq(legalDocumentVersions.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Draft and published versions of the given documents (retired ones are left out). */
  async listCurrentVersions(documentIds: string[]): Promise<DbLegalDocumentVersion[]> {
    if (documentIds.length === 0) return [];
    return this.db
      .select()
      .from(legalDocumentVersions)
      .where(
        and(
          inArray(legalDocumentVersions.documentId, documentIds),
          inArray(legalDocumentVersions.status, ['draft', 'published']),
        ),
      );
  }

  async findVersionByStatus(
    documentId: string,
    status: 'draft' | 'published',
    tx: DrizzleExecutor = this.db,
  ): Promise<DbLegalDocumentVersion | null> {
    const rows = await tx
      .select()
      .from(legalDocumentVersions)
      .where(
        and(
          eq(legalDocumentVersions.documentId, documentId),
          eq(legalDocumentVersions.status, status),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Published versions of documents matching kind/audience for any of the owners. */
  async listPublishedFor(
    owners: (string | null)[],
    audience: LegalAudience,
  ): Promise<{ document: DbLegalDocument; version: DbLegalDocumentVersion }[]> {
    const orgIds = owners.filter((o): o is string => o !== null);
    const includePlatform = owners.includes(null);
    const ownerFilter =
      includePlatform && orgIds.length > 0
        ? sql`(${legalDocuments.organisationId} IS NULL OR ${inArray(legalDocuments.organisationId, orgIds)})`
        : includePlatform
          ? isNull(legalDocuments.organisationId)
          : orgIds.length > 0
            ? inArray(legalDocuments.organisationId, orgIds)
            : sql`false`;
    return this.db
      .select({ document: legalDocuments, version: legalDocumentVersions })
      .from(legalDocuments)
      .innerJoin(legalDocumentVersions, eq(legalDocumentVersions.documentId, legalDocuments.id))
      .where(
        and(
          ownerFilter,
          eq(legalDocuments.audience, audience),
          eq(legalDocumentVersions.status, 'published'),
        ),
      );
  }

  async nextVersionNumber(tx: DrizzleExecutor, documentId: string): Promise<number> {
    const [row] = await tx
      .select({ max: max(legalDocumentVersions.version) })
      .from(legalDocumentVersions)
      .where(eq(legalDocumentVersions.documentId, documentId));
    return (row?.max ?? 0) + 1;
  }

  async insertVersion(
    tx: DrizzleExecutor,
    values: typeof legalDocumentVersions.$inferInsert,
  ): Promise<DbLegalDocumentVersion> {
    const [row] = await tx.insert(legalDocumentVersions).values(values).returning();
    return row!;
  }

  async updateVersion(
    tx: DrizzleExecutor,
    id: string,
    patch: Partial<typeof legalDocumentVersions.$inferInsert>,
  ): Promise<DbLegalDocumentVersion> {
    const [row] = await tx
      .update(legalDocumentVersions)
      .set(patch)
      .where(eq(legalDocumentVersions.id, id))
      .returning();
    return row!;
  }

  async deleteVersion(tx: DrizzleExecutor, id: string): Promise<void> {
    await tx.delete(legalDocumentVersions).where(eq(legalDocumentVersions.id, id));
  }

  // ── Translations ───────────────────────────────────────────────────────

  /** The latest revision of every language of the given versions. */
  async latestTranslations(
    versionIds: string[],
    tx: DrizzleExecutor = this.db,
  ): Promise<DbLegalDocumentTranslation[]> {
    if (versionIds.length === 0) return [];
    return tx
      .selectDistinctOn([legalDocumentTranslations.versionId, legalDocumentTranslations.locale])
      .from(legalDocumentTranslations)
      .where(inArray(legalDocumentTranslations.versionId, versionIds))
      .orderBy(
        legalDocumentTranslations.versionId,
        legalDocumentTranslations.locale,
        desc(legalDocumentTranslations.revision),
      );
  }

  async insertTranslation(
    tx: DrizzleExecutor,
    values: typeof legalDocumentTranslations.$inferInsert,
  ): Promise<DbLegalDocumentTranslation> {
    const [row] = await tx.insert(legalDocumentTranslations).values(values).returning();
    return row!;
  }

  async deleteTranslations(
    tx: DrizzleExecutor,
    versionId: string,
    locale: string,
  ): Promise<number> {
    const rows = await tx
      .delete(legalDocumentTranslations)
      .where(
        and(
          eq(legalDocumentTranslations.versionId, versionId),
          eq(legalDocumentTranslations.locale, locale),
        ),
      )
      .returning({ id: legalDocumentTranslations.id });
    return rows.length;
  }

  // ── Acknowledgements ───────────────────────────────────────────────────

  /** Inserts acknowledgements; a user acknowledges a version at most once. */
  async insertAcknowledgements(tx: DrizzleExecutor, rows: NewAcknowledgement[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.insert(userDocumentAcknowledgements).values(rows).onConflictDoNothing();
  }
}
