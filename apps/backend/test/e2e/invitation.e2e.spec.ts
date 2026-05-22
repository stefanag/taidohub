import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { type AuthenticatedUser } from '../../src/infrastructure/auth/auth.types.js';
import { UsersService } from '../../src/modules/users/users.service.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/** A sysadmin actor — mirrors the shape from users.service.spec.ts. */
const SYSADMIN: AuthenticatedUser = {
  id: 'integration-sysadmin',
  email: 'integration-sysadmin@example.com',
  emailVerified: true,
  name: 'Integration Sysadmin',
  image: null,
  role: 'sysadmin',
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

describe.skipIf(!hasDatabase())('Invitation flow (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let users: UsersService;
  let betterAuth: Auth;

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    close = built.close;
    users = built.app.get(UsersService);
    betterAuth = built.app.get<Auth>(BETTER_AUTH);
  });

  afterAll(async () => {
    await close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invites a user, sets their password via POST /api/account/set-password, and signs them in', async () => {
    const email = `invitee-${Date.now()}@example.com`;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const created = await users.invite({ email, name: 'Invited User' }, SYSADMIN);
    expect(created.email).toBe(email);

    try {
      // Pull the set-password URL out of the captured ConsoleEmailService output.
      const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      // randomBytes(32).toString('hex') → 32 bytes → 64 hex characters
      const match = output.match(/set-password\?token=([0-9a-f]{64})/);
      expect(match).not.toBeNull();
      const token = match![1]!;

      // Drive the REAL HTTP route. The endpoint MUST live outside `/api/auth/*`
      // (better-auth's catch-all 404s anything it does not own) — a 404 here
      // would mean that regression has returned. A service-only call (as the
      // original test did) cannot catch it.
      const res = await request(app.getHttpServer())
        .post('/api/account/set-password')
        .send({ token, password: 'test-password-123' });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'] as string[] | undefined;
      expect(setCookie).toBeDefined();
      expect(setCookie?.length ?? 0).toBeGreaterThan(0);

      // The new user can now sign in with the chosen password.
      await expect(
        betterAuth.api.signInEmail({ body: { email, password: 'test-password-123' } }),
      ).resolves.toBeDefined();
    } finally {
      // Clean up so re-runs stay deterministic.
      await users.delete(created.id, SYSADMIN);
    }
  });
});
