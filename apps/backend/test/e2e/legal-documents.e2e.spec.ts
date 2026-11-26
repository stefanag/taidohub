import { type NestExpressApplication } from '@nestjs/platform-express';
import {
  ApplicableLegalTextsSchema,
  LegalDocumentSchema,
  PublishedLegalDocumentSchema,
} from '@repo/contracts/legal-documents';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type AuthenticatedUser } from '../../src/infrastructure/auth/auth.types.js';
import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  legalDocuments,
  legalDocumentVersions,
  organisationMembership,
  organisations,
  userDocumentAcknowledgements,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { UsersService } from '../../src/modules/users/users.service.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Terms and privacy texts end to end: a sysadmin and a club write and publish
 * texts, the public read path serves them per language, and an invitation can
 * only be accepted together with them.
 */
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
const PASSWORD = 'legal-e2e-password-123';
const body = (text: string) => ({ ops: [{ insert: `${text}\n` }] });

describe.skipIf(!hasDatabase())('Legal documents (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let admin: request.Agent;
  const stamp = Date.now();
  const adminEmail = `legal-admin-${stamp}@example.com`;
  const userIds: string[] = [];
  const orgIds: string[] = [];
  let clubId: string;
  let sysadmin: AuthenticatedUser;

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email: adminEmail, password: PASSWORD, name: 'Legal Admin' } });
    userIds.push(created.user.id);
    await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, created.user.id));
    sysadmin = {
      id: created.user.id,
      email: adminEmail,
      emailVerified: true,
      name: 'Legal Admin',
      image: null,
      role: 'sysadmin',
      locale: 'en',
      deactivatedAt: null,
      memberships: [],
    };

    const [fed] = await db
      .insert(organisations)
      .values({
        type: 'national_federation',
        shortCode: `LF${stamp}`,
        nameEn: 'Fed',
        nameSv: 'Förbund',
        nameFi: 'Liitto',
      })
      .returning();
    const [club] = await db
      .insert(organisations)
      .values({
        type: 'club',
        parentId: fed!.id,
        shortCode: `LC${stamp}`,
        nameEn: 'Club',
        nameSv: 'Klubb',
        nameFi: 'Seura',
      })
      .returning();
    orgIds.push(club!.id, fed!.id);
    clubId = club!.id;

    admin = request.agent(app.getHttpServer());
    await admin
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: adminEmail, password: PASSWORD });
  });

  afterAll(async () => {
    // Deleting the users cascades their acknowledgements, which frees the versions.
    await db
      .delete(userDocumentAcknowledgements)
      .where(inArray(userDocumentAcknowledgements.userId, userIds));
    const docs = await db
      .select({ id: legalDocuments.id })
      .from(legalDocuments)
      .where(inArray(legalDocuments.organisationId, orgIds));
    const platformDocs = await db.select({ id: legalDocuments.id }).from(legalDocuments);
    const ids = [...docs, ...platformDocs].map((d) => d.id);
    if (ids.length) {
      await db.delete(legalDocumentVersions).where(inArray(legalDocumentVersions.documentId, ids));
      await db.delete(legalDocuments).where(inArray(legalDocuments.id, ids));
    }
    await db.delete(organisationMembership).where(inArray(organisationMembership.userId, userIds));
    await db.delete(userTable).where(inArray(userTable.id, userIds));
    for (const id of orgIds) await db.delete(organisations).where(eq(organisations.id, id));
    await close();
  });

  /** Creates a text, writes the given languages and publishes it. */
  async function publishText(
    organisationId: string | null,
    kind: 'terms' | 'privacy',
    texts: Partial<Record<'sv' | 'en' | 'fi', string>>,
  ) {
    const created = await admin
      .post('/api/legal-documents')
      .set('Origin', ORIGIN)
      .send({ kind, organisationId, audience: 'members' });
    expect(created.status).toBe(201);
    const documentId = LegalDocumentSchema.parse(created.body).id;

    const drafted = await admin
      .post(`/api/legal-documents/${documentId}/versions`)
      .set('Origin', ORIGIN)
      .send({ authoritativeLocale: 'sv' });
    expect(drafted.status).toBe(201);
    const versionId = LegalDocumentSchema.parse(drafted.body).draft!.id;

    for (const [locale, text] of Object.entries(texts)) {
      const saved = await admin
        .put(`/api/legal-documents/versions/${versionId}/translations/${locale}`)
        .set('Origin', ORIGIN)
        .send({ title: `${kind} ${locale}`, body: body(text) });
      expect(saved.status).toBe(200);
    }
    const published = await admin
      .post(`/api/legal-documents/versions/${versionId}/publish`)
      .set('Origin', ORIGIN);
    expect(published.status).toBe(200);
    return { documentId, versionId };
  }

  let platformTerms: { documentId: string; versionId: string };
  let clubPrivacy: { documentId: string; versionId: string };

  it('publishes platform and club texts', async () => {
    platformTerms = await publishText(null, 'terms', {
      sv: 'Plattformens villkor',
      en: 'Platform terms',
    });
    clubPrivacy = await publishText(clubId, 'privacy', { sv: 'Klubbens integritetstext' });
  });

  it('refuses to publish without the legally binding language', async () => {
    const created = await admin
      .post('/api/legal-documents')
      .set('Origin', ORIGIN)
      .send({ kind: 'terms', organisationId: clubId, audience: 'members' });
    const documentId = LegalDocumentSchema.parse(created.body).id;
    const drafted = await admin
      .post(`/api/legal-documents/${documentId}/versions`)
      .set('Origin', ORIGIN)
      .send({ authoritativeLocale: 'sv' });
    const versionId = LegalDocumentSchema.parse(drafted.body).draft!.id;
    await admin
      .put(`/api/legal-documents/versions/${versionId}/translations/en`)
      .set('Origin', ORIGIN)
      .send({ title: 'Terms', body: body('English only') });

    const res = await admin
      .post(`/api/legal-documents/versions/${versionId}/publish`)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTHORITATIVE_TRANSLATION_MISSING');
    await admin.delete(`/api/legal-documents/versions/${versionId}`).set('Origin', ORIGIN);
  });

  it('serves published texts publicly, falling back to the binding language', async () => {
    const en = await request(app.getHttpServer()).get('/api/legal/published?kind=terms&locale=en');
    expect(en.status).toBe(200);
    expect(PublishedLegalDocumentSchema.parse(en.body)).toMatchObject({
      authoritativeLocale: 'sv',
      availableLocales: ['en', 'sv'],
      translation: { locale: 'en', title: 'terms en' },
      isFallback: false,
    });

    const fi = await request(app.getHttpServer()).get(
      `/api/legal/published?kind=privacy&organisationId=${clubId}&locale=fi`,
    );
    expect(fi.status).toBe(200);
    expect(fi.body).toMatchObject({ translation: { locale: 'sv' }, isFallback: true });
  });

  it('never changes the binding language of a published version', async () => {
    const res = await admin
      .put(`/api/legal-documents/versions/${platformTerms.versionId}/translations/sv`)
      .set('Origin', ORIGIN)
      .send({ title: 'Ändrad', body: body('Ändrad text') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTHORITATIVE_TRANSLATION_LOCKED');
  });

  it('corrects a translation of a published version as a new revision', async () => {
    const res = await admin
      .put(`/api/legal-documents/versions/${platformTerms.versionId}/translations/en`)
      .set('Origin', ORIGIN)
      .send({ title: 'terms en', body: body('Platform terms, corrected') });
    expect(res.status).toBe(200);
    const en = LegalDocumentSchema.parse(res.body).published!.translations.find(
      (t) => t.locale === 'en',
    );
    expect(en?.revision).toBe(2);
  });

  it('keeps editing to sysadmins and the organisation’s admins', async () => {
    const anonymous = await request(app.getHttpServer()).get('/api/legal-documents?owner=platform');
    expect(anonymous.status).toBe(401);
  });

  it('accepts an invitation only together with the texts that apply', async () => {
    const users = app.get(UsersService);
    const email = `legal-invitee-${stamp}@example.com`;
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    let token: string;
    try {
      const invited = await users.invite({ email, name: 'Invited' }, sysadmin);
      userIds.push(invited.id);
      token = logSpy.mock.calls
        .map((c) => c.join(' '))
        .join('\n')
        .match(/set-password\?token=([0-9a-f]{64})/)![1]!;
      await db
        .insert(organisationMembership)
        .values({ userId: invited.id, organisationId: clubId, role: 'student' });
    } finally {
      logSpy.mockRestore();
    }

    const texts = await request(app.getHttpServer()).get(
      `/api/legal/invitation?token=${token}&locale=en`,
    );
    expect(texts.status).toBe(200);
    const { documents } = ApplicableLegalTextsSchema.parse(texts.body);
    expect(documents.map((d) => d.versionId)).toEqual([
      platformTerms.versionId,
      clubPrivacy.versionId,
    ]);

    const without = await request(app.getHttpServer())
      .post('/api/account/set-password')
      .send({ token, password: 'invitee-password-123' });
    expect(without.status).toBe(400);
    expect(without.body.error.code).toBe('LEGAL_ACKNOWLEDGEMENT_REQUIRED');

    // The link still works after the refusal.
    const accepted = await request(app.getHttpServer())
      .post('/api/account/set-password')
      .send({
        token,
        password: 'invitee-password-123',
        acknowledgements: [
          { versionId: platformTerms.versionId, locale: 'en' },
          { versionId: clubPrivacy.versionId, locale: 'sv' },
        ],
      });
    expect(accepted.status).toBe(200);

    const rows = await db
      .select()
      .from(userDocumentAcknowledgements)
      .where(eq(userDocumentAcknowledgements.userId, userIds.at(-1)!));
    expect(rows).toHaveLength(2);
    const terms = rows.find((r) => r.versionId === platformTerms.versionId)!;
    expect(terms).toMatchObject({
      type: 'accepted',
      displayedLocale: 'en',
      displayedTranslationRevision: 2,
      authoritativeLocale: 'sv',
      context: 'invitation',
      organisationId: null,
    });
    expect(terms.displayedContentHash).not.toBe(terms.authoritativeContentHash);
    expect(rows.find((r) => r.versionId === clubPrivacy.versionId)).toMatchObject({
      type: 'received',
      organisationId: clubId,
    });
  });
});
