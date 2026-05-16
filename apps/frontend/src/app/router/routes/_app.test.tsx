import { describe, expect, it, vi, afterEach } from 'vitest';

// better-auth's React client is a Proxy — `vi.spyOn(authClient, 'getSession')`
// fails with "property not defined". Replace the whole `authClient` with a
// plain stub via module-mock so we can drive `getSession` from each test.
// The mock targets the feature barrel so the route under test (which
// imports via the same barrel) gets the patched value.
vi.mock('@/features/auth-by-email', async (orig) => {
  const actual = await orig<typeof import('@/features/auth-by-email')>();
  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: vi.fn(),
    },
  };
});

import { authClient } from '@/features/auth-by-email';

type GetSessionMock = ReturnType<typeof vi.fn>;

describe('_app route beforeLoad', () => {
  afterEach(() => {
    (authClient.getSession as GetSessionMock).mockReset();
  });

  it('throws a redirect to /login when there is no session', async () => {
    (authClient.getSession as GetSessionMock).mockResolvedValue({
      data: null,
      error: null,
    });

    const { appLayoutRoute } = await import('./_app.js');
    const beforeLoad = appLayoutRoute.options.beforeLoad as () => Promise<void>;

    await expect(beforeLoad()).rejects.toMatchObject({
      options: { to: '/login' },
    });
  });

  it('resolves without throwing when a session exists', async () => {
    (authClient.getSession as GetSessionMock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      error: null,
    });

    const { appLayoutRoute } = await import('./_app.js');
    const beforeLoad = appLayoutRoute.options.beforeLoad as () => Promise<void>;

    await expect(beforeLoad()).resolves.toBeUndefined();
  });
});
