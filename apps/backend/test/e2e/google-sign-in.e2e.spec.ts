import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  featureFlag,
  organisations,
  verification,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Google sign-in without talking to Google: the providers endpoint, the
 * redirect better-auth builds, and the registration intent. The callback
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
});
