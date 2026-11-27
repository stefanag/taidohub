import { type NestExpressApplication } from '@nestjs/platform-express';
import { ApplicableLegalTextsSchema, LegalDocumentSchema } from '@repo/contracts/legal-documents';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  beltRanks,
  beltSystems,
  featureFlag,
  legalDocuments,
  legalDocumentVersions,
  organisations,
  rankHistory,
  userDocumentAcknowledgements,
  userProfile,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Self-registration end to end: the platform publishes its texts for
 * self-registered users, someone registers, confirms the email, signs in,
 * and later deletes the account.
 */
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
const PASSWORD = 'registration-e2e-password-123';

/** Today minus `years` years, as YYYY-MM-DD. */
function yearsAgo(years: number, plusDays = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!hasDatabase())('Self-registration (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let admin: request.Agent;
  const stamp = Date.now();
  const adminEmail = `reg-admin-${stamp}@example.com`;
  const email = `reg-user-${stamp}@example.com`;
  const userIds: string[] = [];
  let federationId: string;
  let clubId: string;
  let termsVersionId: string;
  let privacyVersionId: string;
  let systemId: string;
  let rankId: string;

  const server = () => request(app.getHttpServer());
  const setFlag = (enabled: boolean) =>
    db
      .insert(featureFlag)
      .values({ code: 'self-registration', enabled })
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled } });

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email: adminEmail, password: PASSWORD, name: 'Reg Admin' } });
    userIds.push(created.user.id);
    await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, created.user.id));
    admin = request.agent(app.getHttpServer());
    await admin
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: adminEmail, password: PASSWORD });

    const [fed] = await db
      .insert(organisations)
      .values({
        type: 'national_federation',
        shortCode: `RF${stamp}`,
        nameEn: 'Reg Fed',
        nameSv: 'Förbund',
        nameFi: 'Liitto',
      })
      .returning();
    const [club] = await db
      .insert(organisations)
      .values({
        type: 'club',
        parentId: fed!.id,
        shortCode: `RC${stamp}`,
        nameEn: 'Club',
        nameSv: 'Klubb',
        nameFi: 'Seura',
      })
      .returning();
    federationId = fed!.id;
    clubId = club!.id;
    const [system] = await db
      .insert(beltSystems)
      .values({
        code: `REG-SYS-${stamp}`,
        nameEn: 'Reg system',
        nameSv: 'Reg',
        nameFi: 'Reg',
        sortOrder: 97,
      })
      .returning({ id: beltSystems.id });
    systemId = system!.id;
    const [rank] = await db
      .insert(beltRanks)
      .values({
        systemId,
        level: 1,
        sortOrder: 1,
        nameRomaji: 'Gokyu',
        nameEn: '5th Kyu',
        beltColor: '#FFFF00',
      })
      .returning({ id: beltRanks.id });
    rankId = rank!.id;

    // The platform's texts for self-registered users.
    for (const kind of ['terms', 'privacy'] as const) {
      const doc = await admin
        .post('/api/legal-documents')
        .set('Origin', ORIGIN)
        .send({ kind, organisationId: null, audience: 'self_registered' });
      const draft = await admin
        .post(`/api/legal-documents/${LegalDocumentSchema.parse(doc.body).id}/versions`)
        .set('Origin', ORIGIN)
        .send({ authoritativeLocale: 'sv' });
      const versionId = LegalDocumentSchema.parse(draft.body).draft!.id;
      await admin
        .put(`/api/legal-documents/versions/${versionId}/translations/sv`)
        .set('Origin', ORIGIN)
        .send({ title: kind, body: { ops: [{ insert: `${kind}\n` }] } });
      const published = await admin
        .post(`/api/legal-documents/versions/${versionId}/publish`)
        .set('Origin', ORIGIN);
      expect(published.status).toBe(200);
      if (kind === 'terms') termsVersionId = versionId;
      else privacyVersionId = versionId;
    }
    await setFlag(true);
  });

  afterAll(async () => {
    await setFlag(false);
    const registered = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email));
    const ids = [...userIds, ...registered.map((r) => r.id)];
    await db
      .delete(userDocumentAcknowledgements)
      .where(inArray(userDocumentAcknowledgements.userId, ids));
    const platform = await db.select({ id: legalDocuments.id }).from(legalDocuments);
    if (platform.length) {
      await db.delete(legalDocumentVersions).where(
        inArray(
          legalDocumentVersions.documentId,
          platform.map((d) => d.id),
        ),
      );
      await db.delete(legalDocuments).where(
        inArray(
          legalDocuments.id,
          platform.map((d) => d.id),
        ),
      );
    }
    await db.delete(userTable).where(inArray(userTable.id, ids));
    await db.delete(organisations).where(eq(organisations.id, clubId));
    await db.delete(organisations).where(eq(organisations.id, federationId));
    await db.delete(beltRanks).where(eq(beltRanks.id, rankId));
    await db.delete(beltSystems).where(eq(beltSystems.id, systemId));
    await close();
  });

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Self Registered',
    email,
    password: PASSWORD,
    locale: 'sv',
    dateOfBirth: yearsAgo(20),
    federationId,
    acknowledgements: [
      { versionId: termsVersionId, locale: 'sv' },
      { versionId: privacyVersionId, locale: 'sv' },
    ],
    ...over,
  });

  /** Registers and returns the confirmation link from the email, if one was sent. */
  async function register(over: Record<string, unknown> = {}) {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const res = await server()
        .post('/api/registration')
        .set('X-Forwarded-For', `10.0.0.${stamp % 200}`)
        .send(body(over));
      const line = spy.mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.startsWith('[email] email-verification'));
      return { res, link: line?.match(/url=(\S+)/)?.[1] };
    } finally {
      spy.mockRestore();
    }
  }

  it('closes the old open sign-up route', async () => {
    const res = await server()
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ email: `open-${stamp}@example.com`, password: PASSWORD, name: 'Open' });
    expect(res.status).toBe(404);
  });

  it('lists national federations and the texts to accept', async () => {
    const feds = await server().get('/api/registration/federations');
    expect(feds.status).toBe(200);
    expect(feds.body.map((f: { id: string }) => f.id)).toContain(federationId);
    expect(feds.body.map((f: { id: string }) => f.id)).not.toContain(clubId);

    const texts = await server().get('/api/registration/legal-texts?locale=sv');
    expect(ApplicableLegalTextsSchema.parse(texts.body).documents.map((d) => d.versionId)).toEqual([
      termsVersionId,
      privacyVersionId,
    ]);
  });

  it('refuses users under 13, clubs instead of federations, and missing acceptance', async () => {
    const young = await register({ dateOfBirth: yearsAgo(13, 1) });
    expect(young.res.status).toBe(400);
    expect(young.res.body.error.code).toBe('TOO_YOUNG');

    const club = await register({ federationId: clubId });
    expect(club.res.status).toBe(400);

    const noTerms = await register({ acknowledgements: [] });
    expect(noTerms.res.status).toBe(400);
    expect(noTerms.res.body.error.code).toBe('LEGAL_ACKNOWLEDGEMENT_REQUIRED');

    expect(await db.select().from(userTable).where(eq(userTable.email, email))).toHaveLength(0);
  });

  it('registers, requires a confirmed email, then signs in', async () => {
    const { res, link } = await register({ dateOfBirth: yearsAgo(13) });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'verification_sent' });
    expect(link).toBeDefined();

    const [created] = await db.select().from(userTable).where(eq(userTable.email, email));
    const [profile] = await db
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, created!.id));
    expect(profile).toMatchObject({
      referenceFederationId: federationId,
      dateOfBirth: yearsAgo(13),
    });
    expect(profile!.selfRegisteredAt).not.toBeNull();
    const acks = await db
      .select()
      .from(userDocumentAcknowledgements)
      .where(eq(userDocumentAcknowledgements.userId, created!.id));
    expect(acks.map((a) => [a.type, a.context]).sort()).toEqual([
      ['accepted', 'registration'],
      ['received', 'registration'],
    ]);

    const early = await server()
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('EMAIL_NOT_VERIFIED');

    const url = new URL(link!);
    const confirmed = await server().get(url.pathname + url.search);
    expect(confirmed.status).toBe(302);
    expect(new URL(confirmed.headers.location as string).pathname).toBe('/verify-email');

    const signedIn = await server()
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD });
    expect(signedIn.status).toBe(200);
  });

  it('answers the same for an address that already has an account, without emailing', async () => {
    const { res, link } = await register();
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'verification_sent' });
    expect(link).toBeUndefined();
  });

  it('is unavailable while the feature flag is off', async () => {
    await setFlag(false);
    try {
      expect((await server().get('/api/registration/federations')).status).toBe(404);
    } finally {
      await setFlag(true);
    }
  });

  it('lets the user delete their own account and history after confirming the password', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD });
    const [me] = await db.select().from(userTable).where(eq(userTable.email, email));
    // A self-reported grading: recorded_by is ON DELETE RESTRICT, so the
    // deletion must remove it before the user row.
    await db.insert(rankHistory).values({
      userId: me!.id,
      rankId,
      date: '2020-01-01',
      result: 'pass',
      source: 'external',
      recordedByUserId: me!.id,
    });

    const wrong = await agent
      .delete('/api/account')
      .set('Origin', ORIGIN)
      .send({ password: 'not-the-password' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');

    const deleted = await agent
      .delete('/api/account')
      .set('Origin', ORIGIN)
      .send({ password: PASSWORD });
    expect(deleted.status).toBe(204);
    expect(await db.select().from(userTable).where(eq(userTable.email, email))).toHaveLength(0);
    expect(await db.select().from(rankHistory).where(eq(rankHistory.userId, me!.id))).toHaveLength(
      0,
    );
  });
});
