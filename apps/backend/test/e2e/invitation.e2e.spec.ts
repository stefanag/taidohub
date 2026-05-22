import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { type AuthenticatedUser } from '../../src/infrastructure/auth/auth.types.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
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
  let close: () => Promise<void>;
  let users: UsersService;
  let auth: AuthService;
  let betterAuth: Auth;

  beforeAll(async () => {
    const built = await buildTestApp();
    close = built.close;
    users = built.app.get(UsersService);
    auth = built.app.get(AuthService);
    betterAuth = built.app.get<Auth>(BETTER_AUTH);
  });

  afterAll(async () => {
    await close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invites a user, sets their password from the logged link, and signs them in', async () => {
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

      const headers = await auth.setInitialPassword({ token, password: 'test-password-123' });
      expect(headers).toBeInstanceOf(Headers);
      expect(headers.getSetCookie().length).toBeGreaterThan(0);

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
