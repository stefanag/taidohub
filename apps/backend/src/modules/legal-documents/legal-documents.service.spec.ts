import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { canonicalJson, translationHash } from './content-hash.js';
import { LegalDocumentsAbilityRules } from './legal-documents.abilities.js';
import { LegalDocumentsService } from './legal-documents.service.js';

import type {
  DbLegalDocument,
  DbLegalDocumentTranslation,
  DbLegalDocumentVersion,
} from '../../infrastructure/database/schema/index.js';

const CLUB = '11111111-1111-4111-8111-111111111111';
const FED = '22222222-2222-4222-8222-222222222222';
const OTHER_CLUB = '33333333-3333-4333-8333-333333333333';

const sysadmin = { id: 'u-sys', role: 'sysadmin', memberships: [] } as unknown as AuthenticatedUser;
const clubAdmin = {
  id: 'u-admin',
  role: 'user',
  memberships: [{ organisationId: CLUB, role: 'orgadmin' }],
} as unknown as AuthenticatedUser;
const instructor = {
  id: 'u-instr',
  role: 'user',
  memberships: [{ organisationId: CLUB, role: 'instructor' }],
} as unknown as AuthenticatedUser;

function doc(over: Partial<DbLegalDocument> = {}): DbLegalDocument {
  return {
    id: 'd-1',
    kind: 'terms',
    organisationId: CLUB,
    audience: 'members',
    createdAt: new Date('2026-11-26T10:00:00Z'),
    createdByUserId: 'u-admin',
    ...over,
  };
}

function version(over: Partial<DbLegalDocumentVersion> = {}): DbLegalDocumentVersion {
  return {
    id: 'v-1',
    documentId: 'd-1',
    version: 1,
    status: 'draft',
    authoritativeLocale: 'sv',
    requiresReacceptance: false,
    changeSummary: null,
    publishedAt: null,
    publishedByUserId: null,
    createdAt: new Date('2026-11-26T10:00:00Z'),
    createdByUserId: 'u-admin',
    ...over,
  };
}

function translation(over: Partial<DbLegalDocumentTranslation> = {}): DbLegalDocumentTranslation {
  return {
    id: 't-1',
    versionId: 'v-1',
    locale: 'sv',
    revision: 1,
    title: 'Villkor',
    body: { ops: [{ insert: 'Text\n' }] },
    contentHash: 'hash-sv',
    needsReview: false,
    createdAt: new Date('2026-11-26T10:00:00Z'),
    createdByUserId: 'u-admin',
    ...over,
  };
}

function setup() {
  const repo = {
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn('tx')),
    findDocument: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue([]),
    findDocumentByKey: vi.fn().mockResolvedValue(null),
    insertDocument: vi.fn(async (_tx: unknown, v: Partial<DbLegalDocument>) => doc(v)),
    findVersion: vi.fn(),
    listCurrentVersions: vi.fn().mockResolvedValue([]),
    findVersionByStatus: vi.fn().mockResolvedValue(null),
    listPublishedFor: vi.fn().mockResolvedValue([]),
    nextVersionNumber: vi.fn().mockResolvedValue(2),
    insertVersion: vi.fn(async (_tx: unknown, v: Partial<DbLegalDocumentVersion>) =>
      version({ id: 'v-new', ...v }),
    ),
    updateVersion: vi.fn(async (_tx: unknown, id: string, p: Partial<DbLegalDocumentVersion>) =>
      version({ id, ...p }),
    ),
    deleteVersion: vi.fn(),
    latestTranslations: vi.fn().mockResolvedValue([]),
    insertTranslation: vi.fn(async (_tx: unknown, v: Partial<DbLegalDocumentTranslation>) =>
      translation(v),
    ),
    deleteTranslations: vi.fn().mockResolvedValue(1),
    insertAcknowledgements: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const organisations = {
    getAncestorIds: vi.fn(async (id: string) => (id === CLUB ? [CLUB, FED] : [id])),
  };
  const memberships = { listOrganisationIdsForUser: vi.fn().mockResolvedValue([CLUB]) };
  const tokens = { peekToken: vi.fn() };
  // The real rules, so the tests also cover who may edit what.
  const abilities = {
    createForUser: (user: AuthenticatedUser | null): AppAbility => {
      const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
      new LegalDocumentsAbilityRules().contributeTo(builder, user);
      return builder.build({
        detectSubjectType: (subject) =>
          (subject as { __caslSubjectType__: 'LegalDocument' }).__caslSubjectType__,
      });
    },
  };
  const service = new LegalDocumentsService(
    repo as never,
    abilities as never,
    audit as never,
    organisations as never,
    memberships as never,
    tokens as never,
  );
  return { service, repo, audit, organisations, memberships, tokens };
}

describe('content hash', () => {
  it('ignores key order, which jsonb does not preserve', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(
      translationHash('T', { ops: [{ insert: 'x', attributes: { bold: true, italic: true } }] }),
    ).toBe(
      translationHash('T', { ops: [{ attributes: { italic: true, bold: true }, insert: 'x' }] }),
    );
  });

  it('changes with the content', () => {
    expect(translationHash('T', { ops: [] })).not.toBe(translationHash('U', { ops: [] }));
  });
});

describe('LegalDocumentsService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  describe('who may edit', () => {
    it('lets an orgadmin manage their own organisation but not the platform or another club', async () => {
      await expect(ctx.service.listDocuments(CLUB, clubAdmin)).resolves.toEqual([]);
      await expect(ctx.service.listDocuments('platform', clubAdmin)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(ctx.service.listDocuments(OTHER_CLUB, clubAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does not let instructors edit the texts', async () => {
      await expect(ctx.service.listDocuments(CLUB, instructor)).rejects.toThrow(ForbiddenException);
    });

    it('lets a sysadmin manage the platform texts', async () => {
      await expect(ctx.service.listDocuments('platform', sysadmin)).resolves.toEqual([]);
    });
  });

  describe('createDocument', () => {
    it('refuses texts for self-registered users from an organisation', async () => {
      await expect(
        ctx.service.createDocument(
          { kind: 'terms', organisationId: CLUB, audience: 'self_registered' },
          sysadmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a second document of the same kind for the same owner', async () => {
      ctx.repo.findDocumentByKey.mockResolvedValue(doc());
      await expect(
        ctx.service.createDocument(
          { kind: 'terms', organisationId: CLUB, audience: 'members' },
          clubAdmin,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates and audits a document', async () => {
      ctx.repo.findDocument.mockResolvedValue(doc());
      await ctx.service.createDocument(
        { kind: 'terms', organisationId: CLUB, audience: 'members' },
        clubAdmin,
      );
      expect(ctx.repo.insertDocument).toHaveBeenCalled();
      expect(ctx.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'legal_document',
          action: 'create',
          userId: 'u-admin',
        }),
      );
    });
  });

  describe('versions and languages', () => {
    beforeEach(() => {
      ctx.repo.findDocument.mockResolvedValue(doc());
    });

    it('copies the published translations into a new draft, hidden until reviewed', async () => {
      ctx.repo.findVersionByStatus.mockImplementation(async (_d: string, status: string) =>
        status === 'published' ? version({ id: 'v-pub', status: 'published' }) : null,
      );
      ctx.repo.latestTranslations.mockResolvedValueOnce([
        translation({ versionId: 'v-pub', locale: 'sv' }),
        translation({ versionId: 'v-pub', locale: 'en', needsReview: true }),
      ]);
      await ctx.service.createVersion(
        'd-1',
        { authoritativeLocale: 'sv', copyFromPublished: true },
        clubAdmin,
      );
      expect(ctx.repo.insertTranslation).toHaveBeenCalledTimes(1);
      expect(ctx.repo.insertTranslation).toHaveBeenCalledWith(
        'tx',
        expect.objectContaining({ locale: 'sv', needsReview: true, revision: 1 }),
      );
    });

    it('refuses a second draft', async () => {
      ctx.repo.findVersionByStatus.mockResolvedValue(version());
      await expect(
        ctx.service.createVersion(
          'd-1',
          { authoritativeLocale: 'sv', copyFromPublished: false },
          clubAdmin,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('replaces a translation on a draft, with a hash computed on the server', async () => {
      ctx.repo.findVersion.mockResolvedValue(version());
      const body = { ops: [{ insert: 'Ny text\n' }] };
      await ctx.service.saveTranslation('v-1', 'sv', { title: 'Villkor', body }, clubAdmin);
      expect(ctx.repo.deleteTranslations).toHaveBeenCalledWith('tx', 'v-1', 'sv');
      expect(ctx.repo.insertTranslation).toHaveBeenCalledWith(
        'tx',
        expect.objectContaining({ revision: 1, contentHash: translationHash('Villkor', body) }),
      );
      expect(ctx.audit.record).not.toHaveBeenCalled();
    });

    it('never changes the legally binding language of a published version', async () => {
      ctx.repo.findVersion.mockResolvedValue(version({ status: 'published' }));
      await expect(
        ctx.service.saveTranslation('v-1', 'sv', { title: 'T', body: { ops: [] } }, clubAdmin),
      ).rejects.toMatchObject({
        response: { error: { code: 'AUTHORITATIVE_TRANSLATION_LOCKED' } },
      });
    });

    it('adds a revision when a translation of a published version is corrected', async () => {
      ctx.repo.findVersion.mockResolvedValue(version({ status: 'published' }));
      ctx.repo.latestTranslations.mockResolvedValueOnce([
        translation({ locale: 'en', revision: 2 }),
      ]);
      await ctx.service.saveTranslation(
        'v-1',
        'en',
        { title: 'Terms', body: { ops: [] } },
        clubAdmin,
      );
      expect(ctx.repo.deleteTranslations).not.toHaveBeenCalled();
      expect(ctx.repo.insertTranslation).toHaveBeenCalledWith(
        'tx',
        expect.objectContaining({ revision: 3 }),
      );
      expect(ctx.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'legal_document_translation', action: 'update' }),
      );
    });

    it('refuses to publish without a reviewed text in the binding language', async () => {
      ctx.repo.findVersion.mockResolvedValue(version());
      ctx.repo.latestTranslations.mockResolvedValueOnce([translation({ locale: 'en' })]);
      await expect(ctx.service.publish('v-1', clubAdmin)).rejects.toMatchObject({
        response: { error: { code: 'AUTHORITATIVE_TRANSLATION_MISSING' } },
      });
      ctx.repo.latestTranslations.mockResolvedValueOnce([
        translation({ locale: 'sv', needsReview: true }),
      ]);
      await expect(ctx.service.publish('v-1', clubAdmin)).rejects.toThrow(ConflictException);
    });

    it('retires the previous version when publishing', async () => {
      ctx.repo.findVersion.mockResolvedValue(version());
      ctx.repo.latestTranslations.mockResolvedValueOnce([translation({ locale: 'sv' })]);
      ctx.repo.findVersionByStatus.mockResolvedValue(version({ id: 'v-old', status: 'published' }));
      await ctx.service.publish('v-1', clubAdmin);
      expect(ctx.repo.updateVersion).toHaveBeenCalledWith('tx', 'v-old', { status: 'retired' });
      expect(ctx.repo.updateVersion).toHaveBeenCalledWith(
        'tx',
        'v-1',
        expect.objectContaining({ status: 'published', publishedByUserId: 'u-admin' }),
      );
    });

    it('only changes drafts through the draft endpoints', async () => {
      ctx.repo.findVersion.mockResolvedValue(version({ status: 'published' }));
      await expect(ctx.service.deleteDraft('v-1', clubAdmin)).rejects.toThrow(ConflictException);
      await expect(
        ctx.service.updateVersion('v-1', { requiresReacceptance: true }, clubAdmin),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('public read', () => {
    it('falls back to the binding language and says so', async () => {
      ctx.repo.findDocumentByKey.mockResolvedValue(doc());
      ctx.repo.findVersionByStatus.mockResolvedValue(
        version({ status: 'published', publishedAt: new Date() }),
      );
      ctx.repo.latestTranslations.mockResolvedValue([
        translation({ locale: 'sv' }),
        translation({ locale: 'en', needsReview: true }),
      ]);
      const result = await ctx.service.getPublished({
        kind: 'terms',
        audience: 'members',
        organisationId: CLUB,
        locale: 'en',
      });
      expect(result.translation.locale).toBe('sv');
      expect(result.isFallback).toBe(true);
      expect(result.availableLocales).toEqual(['sv']);
    });
  });

  describe('which texts apply to a member', () => {
    const published = (orgId: string | null, kind: 'terms' | 'privacy', id: string) => ({
      document: doc({ id: `d-${id}`, organisationId: orgId, kind }),
      version: version({ id, documentId: `d-${id}`, status: 'published', publishedAt: new Date() }),
    });

    it('takes platform texts and, per kind, the nearest organisation with a text', async () => {
      ctx.repo.listPublishedFor.mockResolvedValue([
        published(null, 'terms', 'platform-terms'),
        published(FED, 'terms', 'fed-terms'),
        published(CLUB, 'terms', 'club-terms'),
        published(FED, 'privacy', 'fed-privacy'),
      ]);
      ctx.repo.latestTranslations.mockImplementation(async (ids: string[]) =>
        ids.map((id) => translation({ versionId: id, locale: 'sv' })),
      );
      const { documents } = await ctx.service.applicableForMember('u-1', 'sv');
      expect(documents.map((d) => d.versionId)).toEqual([
        'platform-terms',
        'club-terms',
        'fed-privacy',
      ]);
    });

    it('returns nothing when nothing is published', async () => {
      await expect(ctx.service.applicableForMember('u-1')).resolves.toEqual({ documents: [] });
    });
  });

  describe('acknowledgements', () => {
    const applicable = {
      documents: [
        {
          documentId: 'd-1',
          kind: 'terms' as const,
          audience: 'members' as const,
          organisationId: CLUB,
          versionId: 'v-1',
          version: 1,
          publishedAt: '2026-11-26T10:00:00.000Z',
          authoritativeLocale: 'sv' as const,
          availableLocales: ['en' as const, 'sv' as const],
          translation: { locale: 'sv' as const, revision: 1, title: 'T', body: { ops: [] } },
          isFallback: false,
        },
      ],
    };

    it('stores the shown and the binding text, hashed on the server', async () => {
      ctx.repo.latestTranslations.mockResolvedValue([
        translation({ locale: 'sv', contentHash: 'h-sv' }),
        translation({ locale: 'en', revision: 2, contentHash: 'h-en' }),
      ]);
      const rows = await ctx.service.prepareAcknowledgements(
        'u-1',
        applicable,
        [{ versionId: 'v-1', locale: 'en' }],
        'invitation',
      );
      expect(rows).toEqual([
        expect.objectContaining({
          userId: 'u-1',
          type: 'accepted',
          displayedLocale: 'en',
          displayedTranslationRevision: 2,
          displayedContentHash: 'h-en',
          authoritativeLocale: 'sv',
          authoritativeContentHash: 'h-sv',
          context: 'invitation',
          organisationId: CLUB,
        }),
      ]);
    });

    it('refuses a missing, unexpected or unavailable-language acknowledgement', async () => {
      await expect(
        ctx.service.prepareAcknowledgements('u-1', applicable, [], 'invitation'),
      ).rejects.toMatchObject({
        response: { error: { code: 'LEGAL_ACKNOWLEDGEMENT_REQUIRED' } },
      });
      await expect(
        ctx.service.prepareAcknowledgements(
          'u-1',
          applicable,
          [
            { versionId: 'v-1', locale: 'sv' },
            { versionId: 'v-other', locale: 'sv' },
          ],
          'invitation',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        ctx.service.prepareAcknowledgements(
          'u-1',
          applicable,
          [{ versionId: 'v-1', locale: 'fi' }],
          'invitation',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('asks for nothing on a reset link and refuses an unknown link', async () => {
      ctx.tokens.peekToken.mockResolvedValueOnce({ identifier: 'admin-reset:u-1' });
      await expect(ctx.service.applicableForInvitationToken('tok')).resolves.toEqual({
        documents: [],
      });
      ctx.tokens.peekToken.mockResolvedValueOnce(null);
      await expect(ctx.service.applicableForInvitationToken('bad')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
