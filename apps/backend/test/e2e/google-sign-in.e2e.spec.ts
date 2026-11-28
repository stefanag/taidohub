import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  account,
  featureFlag,
  organisations,
  user as userTable,
  verification,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Google sign-in without talking to Google: the providers endpoint, the
 * redirect better-auth builds, the registration intent, and connecting or
 * removing Google from the profile page. The callback
 * (account creation and linking) needs Google itself and is covered by
 * RegistrationService's unit tests and a manual test on staging.
 */
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();

function yearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!hasDatabase())('Google sign-in (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let federationId: string;
  const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    const [fed] = await db
      .insert(organisations)
      .values({
        type: 'national_federation',
        shortCode: `GF${Date.now()}`,
        nameEn: 'G Fed',
        nameSv: 'G',
        nameFi: 'G',
      })
      .returning();
    federationId = fed!.id;
    await db
      .insert(featureFlag)
      .values({ code: 'self-registration', enabled: true })
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled: true } });
  });

  afterAll(async () => {
    await db
      .update(featureFlag)
      .set({ enabled: false })
      .where(eq(featureFlag.code, 'self-registration'));
    await db.delete(organisations).where(eq(organisations.id, federationId));
    await close();
    process.env.GOOGLE_CLIENT_ID = saved.id;
    process.env.GOOGLE_CLIENT_SECRET = saved.secret;
    if (saved.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    if (saved.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('tells the web app that Google is available', async () => {
    const res = await request(app.getHttpServer()).get('/api/account/sign-in-providers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: true });
  });

  it('sends the browser to Google with our callback', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', ORIGIN)
      .send({
        provider: 'google',
        callbackURL: `${ORIGIN}/dashboard`,
        errorCallbackURL: `${ORIGIN}/login`,
      });
    expect(res.status).toBe(200);
    const url = new URL(res.body.url as string);
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      new URL(
        '/api/auth/callback/google',
        process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
      ).toString(),
    );
  });

  it('hands out a registration intent only after the usual checks', async () => {
    const young = await request(app.getHttpServer())
      .post('/api/registration/google-intent')
      .send({ locale: 'sv', dateOfBirth: yearsAgo(12), federationId });
    expect(young.status).toBe(400);
    expect(young.body.error.code).toBe('TOO_YOUNG');

    const ok = await request(app.getHttpServer())
      .post('/api/registration/google-intent')
      .send({ locale: 'sv', dateOfBirth: yearsAgo(20), federationId });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.intent).toBe('string');
    const [row] = await db
      .select()
      .from(verification)
      .where(eq(verification.value, ok.body.intent as string));
    expect(row?.identifier).toMatch(/^registration-intent:/);
    await db.delete(verification).where(eq(verification.value, ok.body.intent as string));
  });

  describe('connecting and removing Google on the profile page', () => {
    const email = `google-link-${Date.now()}@example.com`;
    let userId: string;
    let agent: request.Agent;

    beforeAll(async () => {
      const created = await app
        .get<Auth>(BETTER_AUTH)
        .api.signUpEmail({ body: { email, password: 'google-link-password-1', name: 'Link' } });
      userId = created.user.id;
      agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email, password: 'google-link-password-1' })
        .expect(200);
    });

    afterAll(async () => {
      await db.delete(userTable).where(eq(userTable.id, userId));
    });

    it('sends a signed-in user to Google to connect an account', async () => {
      const res = await agent
        .post('/api/auth/link-social')
        .set('Origin', ORIGIN)
        .send({ provider: 'google', callbackURL: `${ORIGIN}/profile`, errorCallbackURL: `${ORIGIN}/profile` });
      expect(res.status).toBe(200);
      expect(new URL(res.body.url as string).hostname).toBe('accounts.google.com');
    });

    it('refuses to connect without a session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/link-social')
        .set('Origin', ORIGIN)
        .send({ provider: 'google', callbackURL: `${ORIGIN}/profile` });
      expect(res.status).toBe(401);
    });

    it('removes Google, but never the last way to sign in', async () => {
      // Stand-in for a completed link: the callback itself needs Google.
      await db.insert(account).values({
        id: `google-acc-${Date.now()}`,
        accountId: `google-sub-${Date.now()}`,
        providerId: 'google',
        userId,
      });
      const listed = await agent.get('/api/auth/list-accounts').expect(200);
      const accounts = listed.body as { id: string; providerId: string }[];
      expect(accounts.map((a) => a.providerId).sort()).toEqual(['credential', 'google']);
      const byProvider = (p: string) => accounts.find((a) => a.providerId === p)!.id;

      await agent
        .post('/api/auth/unlink-account')
        .set('Origin', ORIGIN)
        .send({ accountId: byProvider('google') })
        .expect(200);
      const last = await agent
        .post('/api/auth/unlink-account')
        .set('Origin', ORIGIN)
        .send({ accountId: byProvider('credential') });
      expect(last.status).toBe(400);
      const rows = await db.select().from(account).where(eq(account.userId, userId));
      expect(rows.map((r) => r.providerId)).toEqual(['credential']);
    });
  });
});
