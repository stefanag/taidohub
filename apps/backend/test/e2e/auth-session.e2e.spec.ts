import { type NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  session as sessionTable,
  user as userTable,
} from '../../src/infrastructure/database/schema/users.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Regression coverage for the better-auth flows TaidoHub depends on, driven
 * over real HTTP: email sign-in and sign-out, the session cookie reaching the
 * global AuthGuard, self-service password reset, and sysadmin impersonation.
 * Written for the better-auth 1.6 -> 1.7 upgrade; keep it when upgrading again.
 */

// Requests that carry a session cookie must come from a trusted origin, or
// better-auth rejects them as cross-site. The first WEB_ORIGIN entry is trusted.
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();

const PASSWORD = 'initial-password-123';

describe.skipIf(!hasDatabase())('better-auth sessions (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let auth: Auth;

  const stamp = Date.now();
  const adminEmail = `auth-e2e-admin-${stamp}@example.com`;
  const memberEmail = `auth-e2e-member-${stamp}@example.com`;
  let adminId: string;
  let memberId: string;

  const signIn = async (email: string, password = PASSWORD) => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password });
    return { agent, res };
  };

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    close = built.close;
    db = app.get<DrizzleDb>(DRIZZLE);
    auth = app.get<Auth>(BETTER_AUTH);

    const admin = await auth.api.signUpEmail({
      body: { email: adminEmail, password: PASSWORD, name: 'Auth E2E Admin' },
    });
    const member = await auth.api.signUpEmail({
      body: { email: memberEmail, password: PASSWORD, name: 'Auth E2E Member' },
    });
    adminId = admin.user.id;
    memberId = member.user.id;
    // `role` is not user-settable (input: false), so promote directly.
    await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, adminId));
  });

  afterAll(async () => {
    // Sessions and accounts cascade; audit_log references are set to null.
    await db.delete(userTable).where(inArray(userTable.id, [adminId, memberId]));
    await close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs in with email and password and authenticates later requests by cookie', async () => {
    const { agent, res } = await signIn(memberEmail);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();

    const me = await agent.get('/api/users/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(memberEmail);
  });

  it('rejects a wrong password', async () => {
    const { res } = await signIn(memberEmail, 'not-the-password');
    expect(res.status).toBe(401);
  });

  it('rejects requests without a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('signs out and the old cookie stops working', async () => {
    const { agent } = await signIn(memberEmail);
    const cookies = (await agent.get('/api/users/me')).request.cookies;

    const out = await agent.post('/api/auth/sign-out').set('Origin', ORIGIN).send({});
    expect(out.status).toBe(200);

    const after = await request(app.getHttpServer()).get('/api/users/me').set('Cookie', cookies);
    expect(after.status).toBe(401);
  });

  it('resets a password through the emailed link and signs in with the new one', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const requested = await request(app.getHttpServer())
      .post('/api/auth/request-password-reset')
      .set('Origin', ORIGIN)
      .send({ email: memberEmail, redirectTo: `${ORIGIN}/set-password` });
    expect(requested.status).toBe(200);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const match = output.match(/password-reset to=\S+ url=\S*\/reset-password\/([^?\s]+)/);
    expect(match).not.toBeNull();
    const token = match![1]!;

    const newPassword = 'reset-password-456';
    const reset = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .set('Origin', ORIGIN)
      .send({ token, newPassword });
    expect(reset.status).toBe(200);

    expect((await signIn(memberEmail, PASSWORD)).res.status).toBe(401);
    const { res } = await signIn(memberEmail, newPassword);
    expect(res.status).toBe(200);

    // Restore the shared password for the remaining tests.
    await auth.api.setUserPassword({
      body: { userId: memberId, newPassword: PASSWORD },
      headers: await sessionHeaders(adminEmail),
    });
  });

  it('lets a sysadmin impersonate a member and stop again', async () => {
    const { agent } = await signIn(adminEmail);

    const started = await agent
      .post('/api/admin/impersonate-user')
      .set('Origin', ORIGIN)
      .send({ userId: memberId });
    expect(started.status).toBe(200);

    const asMember = await agent.get('/api/users/me');
    expect(asMember.status).toBe(200);
    expect(asMember.body.email).toBe(memberEmail);

    const impersonated = await db
      .select({ userId: sessionTable.userId, impersonatedBy: sessionTable.impersonatedBy })
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, memberId), isNotNull(sessionTable.impersonatedBy)));
    expect(impersonated).toContainEqual({ userId: memberId, impersonatedBy: adminId });

    const stopped = await agent
      .post('/api/admin/stop-impersonating')
      .set('Origin', ORIGIN)
      .send({});
    expect(stopped.status).toBe(200);

    const asAdmin = await agent.get('/api/users/me');
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.email).toBe(adminEmail);
  });

  it('does not let a member impersonate anyone', async () => {
    const { agent } = await signIn(memberEmail);
    const res = await agent
      .post('/api/admin/impersonate-user')
      .set('Origin', ORIGIN)
      .send({ userId: adminId });
    expect(res.status).toBe(403);
  });

  /** Headers carrying a fresh session cookie for `email`, for auth.api calls. */
  async function sessionHeaders(email: string): Promise<Headers> {
    const { res } = await signIn(email);
    const headers = new Headers();
    const cookies = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]);
    headers.set('cookie', cookies.join('; '));
    return headers;
  }
});
