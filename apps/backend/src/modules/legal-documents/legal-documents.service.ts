import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCodes } from '@repo/contracts/errors';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { type DrizzleExecutor } from '../../infrastructure/database/client.js';
import {
  type DbLegalDocument,
  type DbLegalDocumentTranslation,
  type DbLegalDocumentVersion,
} from '../../infrastructure/database/schema/index.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { OrganisationsService } from '../organisations/organisations.service.js';

import { translationHash } from './content-hash.js';
import { LegalDocumentsRepository, type NewAcknowledgement } from './legal-documents.repository.js';

import type {
  ApplicableLegalTexts,
  CreateLegalDocumentInput,
  CreateLegalDocumentVersionInput,
  GetPublishedLegalDocumentQuery,
  LegalAcknowledgementInput,
  LegalDocument,
  LegalDocumentVersion,
  LegalLocale,
  PublishedLegalDocument,
  SaveLegalTranslationInput,
  UpdateLegalDocumentVersionInput,
} from '@repo/contracts/legal-documents';

/** Why a user acknowledges texts; stored with every acknowledgement. */
export type AcknowledgementContext = 'registration' | 'invitation' | 'club_join' | 'new_version';

/** The kinds a member must see from their organisations. */
const MEMBER_KINDS = ['terms', 'privacy'] as const;

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ error: { code, message } });
}

function notFound(message = 'Not found'): NotFoundException {
  return new NotFoundException({ error: { code: ErrorCodes.NOT_FOUND, message } });
}

function mapVersion(
  row: DbLegalDocumentVersion,
  translations: DbLegalDocumentTranslation[],
): LegalDocumentVersion {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    status: row.status,
    authoritativeLocale: row.authoritativeLocale as LegalLocale,
    requiresReacceptance: row.requiresReacceptance,
    changeSummary: row.changeSummary,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    translations: translations
      .filter((t) => t.versionId === row.id)
      .map((t) => ({
        locale: t.locale as LegalLocale,
        revision: t.revision,
        title: t.title,
        body: t.body,
        contentHash: t.contentHash,
        needsReview: t.needsReview,
        createdAt: t.createdAt.toISOString(),
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale)),
  };
}

/**
 * Terms of use and privacy notices: editing, publishing, the public read path,
 * which texts apply to whom, and the acknowledgement log.
 *
 * Language rules (docs/superpowers/plans/2026-11-26-legal-documents.md):
 * the translation in a version's authoritative language is legally binding
 * and never changes once published; other translations can be corrected
 * after publishing, each correction adding a revision; translations copied
 * from a previous version are hidden until reviewed.
 */
@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly repo: LegalDocumentsRepository,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditLogService,
    private readonly organisations: OrganisationsService,
    private readonly memberships: MembershipsService,
    private readonly tokens: VerificationTokenService,
  ) {}

  // ── Admin: documents ───────────────────────────────────────────────────

  async listDocuments(
    owner: 'platform' | string,
    user: AuthenticatedUser,
  ): Promise<LegalDocument[]> {
    const organisationId = owner === 'platform' ? null : owner;
    this.assertCanManage(user, organisationId);
    const docs = await this.repo.listDocuments(organisationId);
    return this.hydrate(docs);
  }

  async getDocument(id: string, user: AuthenticatedUser): Promise<LegalDocument> {
    const doc = await this.repo.findDocument(id);
    if (!doc) throw notFound('Legal document not found');
    this.assertCanManage(user, doc.organisationId);
    const [hydrated] = await this.hydrate([doc]);
    return hydrated!;
  }

  async createDocument(
    input: CreateLegalDocumentInput,
    user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    if (input.organisationId !== null && input.audience !== 'members') {
      throw new BadRequestException({
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: 'Organisations can only publish texts for their members.',
        },
      });
    }
    this.assertCanManage(user, input.organisationId);
    if (input.organisationId !== null) {
      const ancestors = await this.organisations.getAncestorIds(input.organisationId);
      if (ancestors.length === 0) throw notFound('Organisation not found');
    }
    const existing = await this.repo.findDocumentByKey(
      input.kind,
      input.organisationId,
      input.audience,
    );
    if (existing)
      throw conflict('DOCUMENT_EXISTS', 'This text already exists; add a new version instead.');

    const doc = await this.repo.transaction(async (tx) => {
      const row = await this.repo.insertDocument(tx, {
        kind: input.kind,
        organisationId: input.organisationId,
        audience: input.audience,
        createdByUserId: user.id,
      });
      await this.record(tx, user, 'legal_document', row.id, 'create', null, input);
      return row;
    });
    const [hydrated] = await this.hydrate([doc]);
    return hydrated!;
  }

  // ── Admin: versions and translations ───────────────────────────────────

  async createVersion(
    documentId: string,
    input: CreateLegalDocumentVersionInput,
    user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    const doc = await this.repo.findDocument(documentId);
    if (!doc) throw notFound('Legal document not found');
    this.assertCanManage(user, doc.organisationId);

    await this.repo.transaction(async (tx) => {
      if (await this.repo.findVersionByStatus(documentId, 'draft', tx)) {
        throw conflict('DRAFT_EXISTS', 'This text already has a draft.');
      }
      const published = await this.repo.findVersionByStatus(documentId, 'published', tx);
      const version = await this.repo.insertVersion(tx, {
        documentId,
        version: await this.repo.nextVersionNumber(tx, documentId),
        status: 'draft',
        authoritativeLocale: input.authoritativeLocale,
        createdByUserId: user.id,
      });
      if (input.copyFromPublished && published) {
        const source = await this.repo.latestTranslations([published.id], tx);
        for (const t of source.filter((s) => !s.needsReview)) {
          await this.repo.insertTranslation(tx, {
            versionId: version.id,
            locale: t.locale,
            revision: 1,
            title: t.title,
            body: t.body,
            contentHash: t.contentHash,
            needsReview: true,
            createdByUserId: user.id,
          });
        }
      }
      await this.record(tx, user, 'legal_document_version', version.id, 'create', null, {
        documentId,
        version: version.version,
        authoritativeLocale: version.authoritativeLocale,
      });
    });
    return this.getDocument(documentId, user);
  }

  async updateVersion(
    versionId: string,
    input: UpdateLegalDocumentVersionInput,
    user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    const { version, doc } = await this.loadVersion(versionId, user);
    this.assertDraft(version);
    await this.repo.transaction(async (tx) => {
      const updated = await this.repo.updateVersion(tx, versionId, {
        ...(input.authoritativeLocale !== undefined && {
          authoritativeLocale: input.authoritativeLocale,
        }),
        ...(input.requiresReacceptance !== undefined && {
          requiresReacceptance: input.requiresReacceptance,
        }),
        ...(input.changeSummary !== undefined && { changeSummary: input.changeSummary }),
      });
      await this.record(tx, user, 'legal_document_version', versionId, 'update', version, updated);
    });
    return this.getDocument(doc.id, user);
  }

  async deleteDraft(versionId: string, user: AuthenticatedUser): Promise<void> {
    const { version } = await this.loadVersion(versionId, user);
    this.assertDraft(version);
    await this.repo.transaction(async (tx) => {
      await this.repo.deleteVersion(tx, versionId);
      await this.record(tx, user, 'legal_document_version', versionId, 'delete', version, null);
    });
  }

  async saveTranslation(
    versionId: string,
    locale: LegalLocale,
    input: SaveLegalTranslationInput,
    user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    const { version, doc } = await this.loadVersion(versionId, user);
    if (version.status === 'retired') {
      throw conflict('VERSION_RETIRED', 'A retired version can no longer be changed.');
    }
    if (version.status === 'published' && locale === version.authoritativeLocale) {
      throw conflict(
        'AUTHORITATIVE_TRANSLATION_LOCKED',
        'The legally binding language of a published version cannot change. Publish a new version instead.',
      );
    }
    const contentHash = translationHash(input.title, input.body);

    await this.repo.transaction(async (tx) => {
      const [before] = (await this.repo.latestTranslations([versionId], tx)).filter(
        (t) => t.locale === locale,
      );
      let revision = 1;
      if (version.status === 'draft') {
        await this.repo.deleteTranslations(tx, versionId, locale);
      } else {
        revision = (before?.revision ?? 0) + 1;
      }
      const row = await this.repo.insertTranslation(tx, {
        versionId,
        locale,
        revision,
        title: input.title,
        body: input.body,
        contentHash,
        needsReview: false,
        createdByUserId: user.id,
      });
      // Drafts change freely; only corrections to a published version are evidence.
      if (version.status === 'published') {
        await this.record(
          tx,
          user,
          'legal_document_translation',
          row.id,
          before ? 'update' : 'create',
          before
            ? { versionId, locale, revision: before.revision, contentHash: before.contentHash }
            : null,
          { versionId, locale, revision, contentHash },
        );
      }
    });
    return this.getDocument(doc.id, user);
  }

  async deleteTranslation(
    versionId: string,
    locale: LegalLocale,
    user: AuthenticatedUser,
  ): Promise<LegalDocument> {
    const { version, doc } = await this.loadVersion(versionId, user);
    this.assertDraft(version);
    await this.repo.transaction(async (tx) => {
      const removed = await this.repo.deleteTranslations(tx, versionId, locale);
      if (removed === 0) throw notFound('Translation not found');
    });
    return this.getDocument(doc.id, user);
  }

  async publish(versionId: string, user: AuthenticatedUser): Promise<LegalDocument> {
    const { version, doc } = await this.loadVersion(versionId, user);
    this.assertDraft(version);
    await this.repo.transaction(async (tx) => {
      const translations = await this.repo.latestTranslations([versionId], tx);
      const binding = translations.find((t) => t.locale === version.authoritativeLocale);
      if (!binding || binding.needsReview) {
        throw conflict(
          'AUTHORITATIVE_TRANSLATION_MISSING',
          'Write and save the text in the legally binding language before publishing.',
        );
      }
      const previous = await this.repo.findVersionByStatus(doc.id, 'published', tx);
      if (previous) await this.repo.updateVersion(tx, previous.id, { status: 'retired' });
      const published = await this.repo.updateVersion(tx, versionId, {
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId: user.id,
      });
      await this.record(
        tx,
        user,
        'legal_document_version',
        versionId,
        'update',
        { status: 'draft' },
        {
          status: 'published',
          version: published.version,
          authoritativeLocale: published.authoritativeLocale,
          authoritativeContentHash: binding.contentHash,
          retiredVersionId: previous?.id ?? null,
        },
      );
    });
    return this.getDocument(doc.id, user);
  }

  // ── Public read ────────────────────────────────────────────────────────

  async getPublished(query: GetPublishedLegalDocumentQuery): Promise<PublishedLegalDocument> {
    const doc = await this.repo.findDocumentByKey(
      query.kind,
      query.organisationId ?? null,
      query.audience,
    );
    const version = doc ? await this.repo.findVersionByStatus(doc.id, 'published') : null;
    if (!doc || !version) throw notFound('No published text');
    const translations = await this.repo.latestTranslations([version.id]);
    return this.toPublished(doc, version, translations, query.locale);
  }

  // ── Which texts apply ──────────────────────────────────────────────────

  /**
   * The texts a member must see: the platform's `members` texts, and for
   * each organisation they belong to, per kind, the organisation's own text or
   * else the nearest ancestor's.
   */
  async applicableForMember(userId: string, locale?: LegalLocale): Promise<ApplicableLegalTexts> {
    const orgIds = await this.memberships.listOrganisationIdsForUser(userId);
    const chains = await Promise.all(orgIds.map((id) => this.organisations.getAncestorIds(id)));
    const owners = [null, ...new Set(chains.flat())];
    const published = await this.repo.listPublishedFor(owners, 'members');

    const chosen = new Map<string, (typeof published)[number]>();
    for (const p of published.filter((x) => x.document.organisationId === null)) {
      chosen.set(p.version.id, p);
    }
    for (const chain of chains) {
      for (const kind of MEMBER_KINDS) {
        for (const orgId of chain) {
          const hit = published.find(
            (p) => p.document.organisationId === orgId && p.document.kind === kind,
          );
          if (hit) {
            chosen.set(hit.version.id, hit);
            break;
          }
        }
      }
    }

    const entries = [...chosen.values()];
    const translations = await this.repo.latestTranslations(entries.map((e) => e.version.id));
    return {
      documents: entries
        .map((e) => this.toPublished(e.document, e.version, translations, locale))
        .sort((a, b) => this.order(a) - this.order(b)),
    };
  }

  /** The platform's texts for people who register themselves. */
  async applicableForSelfRegistration(locale?: LegalLocale): Promise<ApplicableLegalTexts> {
    const published = await this.repo.listPublishedFor([null], 'self_registered');
    const translations = await this.repo.latestTranslations(published.map((p) => p.version.id));
    return {
      documents: published
        .map((p) => this.toPublished(p.document, p.version, translations, locale))
        .sort((a, b) => this.order(a) - this.order(b)),
    };
  }

  /**
   * The texts shown on the set-password page of an invitation. Password-reset
   * links ask for nothing. An unknown or expired token is refused.
   */
  async applicableForInvitationToken(
    token: string,
    locale?: LegalLocale,
  ): Promise<ApplicableLegalTexts> {
    const peeked = await this.tokens.peekToken(token);
    if (!peeked) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }
    if (!peeked.identifier.startsWith('invite:')) return { documents: [] };
    return this.applicableForMember(peeked.identifier.slice('invite:'.length), locale);
  }

  /**
   * Checks that `given` acknowledges exactly the `applicable` texts, each in a
   * language it is available in, and returns the rows to store. Hashes come
   * from the server's own copy, never from the client.
   */
  async prepareAcknowledgements(
    userId: string,
    applicable: ApplicableLegalTexts,
    given: LegalAcknowledgementInput[],
    context: AcknowledgementContext,
  ): Promise<NewAcknowledgement[]> {
    const required = new Map(applicable.documents.map((d) => [d.versionId, d]));
    const byVersion = new Map(given.map((g) => [g.versionId, g]));
    const missing = [...required.keys()].filter((id) => !byVersion.has(id));
    const unexpected = [...byVersion.keys()].filter((id) => !required.has(id));
    const wrongLocale = given.filter((g) => {
      const doc = required.get(g.versionId);
      return doc && !doc.availableLocales.includes(g.locale);
    });
    if (missing.length || unexpected.length || wrongLocale.length) {
      throw new BadRequestException({
        error: {
          code: 'LEGAL_ACKNOWLEDGEMENT_REQUIRED',
          message: 'Accept the terms and confirm that you have read the privacy notice.',
          details: { missing, unexpected, wrongLocale: wrongLocale.map((g) => g.versionId) },
        },
      });
    }

    const docs = [...required.values()];
    const translations = await this.repo.latestTranslations(docs.map((d) => d.versionId));
    const now = new Date();
    return docs.map((doc) => {
      const shown = byVersion.get(doc.versionId)!.locale;
      const displayed = translations.find(
        (t) => t.versionId === doc.versionId && t.locale === shown,
      )!;
      const binding = translations.find(
        (t) => t.versionId === doc.versionId && t.locale === doc.authoritativeLocale,
      )!;
      return {
        userId,
        versionId: doc.versionId,
        type: doc.kind === 'terms' ? 'accepted' : 'received',
        displayedLocale: shown,
        displayedTranslationRevision: displayed.revision,
        displayedContentHash: displayed.contentHash,
        authoritativeLocale: doc.authoritativeLocale,
        authoritativeContentHash: binding.contentHash,
        context,
        organisationId: doc.organisationId,
        acknowledgedAt: now,
      } satisfies NewAcknowledgement;
    });
  }

  /** Stores prepared acknowledgements inside the caller's transaction. */
  async recordAcknowledgements(tx: DrizzleExecutor, rows: NewAcknowledgement[]): Promise<void> {
    await this.repo.insertAcknowledgements(tx, rows);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private toPublished(
    doc: DbLegalDocument,
    version: DbLegalDocumentVersion,
    translations: DbLegalDocumentTranslation[],
    locale?: LegalLocale,
  ): PublishedLegalDocument {
    const reviewed = translations.filter((t) => t.versionId === version.id && !t.needsReview);
    const binding = reviewed.find((t) => t.locale === version.authoritativeLocale);
    const wanted = locale ? reviewed.find((t) => t.locale === locale) : undefined;
    const shown = wanted ?? binding ?? reviewed[0];
    if (!shown) throw notFound('No published text');
    return {
      documentId: doc.id,
      kind: doc.kind,
      audience: doc.audience,
      organisationId: doc.organisationId,
      versionId: version.id,
      version: version.version,
      publishedAt: (version.publishedAt ?? version.createdAt).toISOString(),
      authoritativeLocale: version.authoritativeLocale as LegalLocale,
      availableLocales: reviewed.map((t) => t.locale as LegalLocale).sort(),
      translation: {
        locale: shown.locale as LegalLocale,
        revision: shown.revision,
        title: shown.title,
        body: shown.body,
      },
      isFallback: locale !== undefined && shown.locale !== locale,
    };
  }

  /** Platform texts first, then terms before privacy. */
  private order(d: PublishedLegalDocument): number {
    return (d.organisationId === null ? 0 : 10) + (d.kind === 'terms' ? 0 : 1);
  }

  private async hydrate(docs: DbLegalDocument[]): Promise<LegalDocument[]> {
    const versions = await this.repo.listCurrentVersions(docs.map((d) => d.id));
    const translations = await this.repo.latestTranslations(versions.map((v) => v.id));
    return docs.map((doc) => {
      const published = versions.find((v) => v.documentId === doc.id && v.status === 'published');
      const draft = versions.find((v) => v.documentId === doc.id && v.status === 'draft');
      return {
        id: doc.id,
        kind: doc.kind,
        organisationId: doc.organisationId,
        audience: doc.audience,
        createdAt: doc.createdAt.toISOString(),
        published: published ? mapVersion(published, translations) : null,
        draft: draft ? mapVersion(draft, translations) : null,
      };
    });
  }

  private async loadVersion(
    versionId: string,
    user: AuthenticatedUser,
  ): Promise<{ version: DbLegalDocumentVersion; doc: DbLegalDocument }> {
    const version = await this.repo.findVersion(versionId);
    const doc = version ? await this.repo.findDocument(version.documentId) : null;
    if (!version || !doc) throw notFound('Version not found');
    this.assertCanManage(user, doc.organisationId);
    return { version, doc };
  }

  private assertDraft(version: DbLegalDocumentVersion): void {
    if (version.status !== 'draft') {
      throw conflict('VERSION_NOT_DRAFT', 'Only a draft can be changed this way.');
    }
  }

  private assertCanManage(user: AuthenticatedUser, organisationId: string | null): void {
    const ability = this.abilities.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'LegalDocument', organisationId })) {
      throw new ForbiddenException({ error: { code: ErrorCodes.FORBIDDEN, message: 'Forbidden' } });
    }
  }

  private record(
    tx: DrizzleExecutor,
    user: AuthenticatedUser,
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete',
    before: unknown,
    after: unknown,
  ): Promise<void> {
    return this.audit.record({
      tx,
      entityType,
      entityId,
      action,
      userId: user.id,
      impersonatedById: user.impersonatedBy ?? null,
      actingUserId: null,
      before,
      after,
    });
  }
}
