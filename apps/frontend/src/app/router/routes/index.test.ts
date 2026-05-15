import { describe, expect, it, vi, afterEach } from 'vitest';

// better-auth's React client is a Proxy — replace authClient via module-mock.
vi.mock('@/features/auth-by-email/api/auth.api', async (orig) => {
  const actual =
    await orig<typeof import('@/features/auth-by-email/api/auth.api')>();
  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: vi.fn(),
    },
  };
});

import { authClient } from '@/features/auth-by-email/api/auth.api';

type GetSessionMock = ReturnType<typeof vi.fn>;

describe('/ route beforeLoad', () => {
  afterEach(() => {
    (authClient.getSession as GetSessionMock).mockReset();
  });

  it('does not throw when no session exists', async () => {
    (authClient.getSession as GetSessionMock).mockResolvedValue({
      data: null,
      error: null,
    });

    const { indexRoute } = await import('./index.js');
    const beforeLoad = indexRoute.options.beforeLoad as () => Promise<void>;

    await expect(beforeLoad()).resolves.toBeUndefined();
  });

  it('throws redirect to /dashboard when authenticated', async () => {
    (authClient.getSession as GetSessionMock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      error: null,
    });

    const { indexRoute } = await import('./index.js');
    const beforeLoad = indexRoute.options.beforeLoad as () => Promise<void>;

    await expect(beforeLoad()).rejects.toMatchObject({
      options: { to: '/dashboard' },
    });
  });
});
