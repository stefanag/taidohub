import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import { user as userTable } from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Self-service password reset, end to end through better-auth: request a
 * link, read it from the email (the console transport in tests), follow it,
 * set a new password and sign in with it.
 */
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

describe.skipIf(!hasDatabase())('Self-service password reset (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  const email = `reset-${Date.now()}@example.com`;
  let userId: string;

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email, password: OLD_PASSWORD, name: 'Reset User' } });
    userId = created.user.id;
  });

  afterAll(async () => {
    await db.delete(userTable).where(eq(userTable.id, userId));
    await close();
  });

  const signIn = (password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password });

  /** Requests a reset for `address` and returns the link from the email, if one was sent. */
  const requestLink = async (address: string): Promise<{ status: number; link: string | undefined }> => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const res = await request(app.getHttpServer())
        .post('/api/auth/request-password-reset')
        .set('Origin', ORIGIN)
        .send({ email: address, redirectTo: `${ORIGIN}/reset-password` });
      const line = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((l) => l.startsWith('[email] password-reset'));
      return { status: res.status, link: line?.match(/url=(\S+)/)?.[1] };
    } finally {
      logSpy.mockRestore();
    }
  };

  it('answers an unknown address like a known one, without sending anything', async () => {
    const { status, link } = await requestLink('nobody-here@example.com');
    expect(status).toBe(200);
    expect(link).toBeUndefined();
  });

  it('emails a link that leads to the reset page and sets a new password', async () => {
    const { status, link } = await requestLink(email);
    expect(status).toBe(200);
    expect(link).toBeDefined();

    // The emailed link is better-auth's; it checks the token and redirects
    // to the web app's reset page with it.
    const followed = await request(app.getHttpServer()).get(new URL(link!).pathname + new URL(link!).search);
    expect(followed.status).toBe(302);
    const target = new URL(followed.headers.location as string);
    expect(`${target.origin}${target.pathname}`).toBe(`${ORIGIN}/reset-password`);
    const token = target.searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ newPassword: NEW_PASSWORD, token });
    expect(reset.status).toBe(200);

    expect((await signIn(NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(OLD_PASSWORD)).status).toBe(401);

    // A used token cannot be used again.
    const again = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ newPassword: 'third-password-789', token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_TOKEN');
  });

  it('sends no link that would hand the token to another site', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await request(app.getHttpServer())
        .post('/api/auth/request-password-reset')
        .set('Origin', ORIGIN)
        .send({ email, redirectTo: 'https://evil.example/reset-password' });
      // better-auth answers 403 here outside tests; in tests it skips that
      // check, so this exercises our own guard in sendResetPassword.
      expect([200, 403]).toContain(res.status);
      const sent = logSpy.mock.calls.some((args) => String(args[0]).startsWith('[email] password-reset'));
      expect(sent).toBe(false);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
