import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn().mockResolvedValue({}) };
});

import { httpClient } from '@/shared/api';

import { startImpersonating, stopImpersonating } from './impersonation.api.js';

describe('impersonation api', () => {
  it('POSTs to /api/admin/impersonate-user with userId in the body', async () => {
    await startImpersonating('u-1');
    expect(httpClient).toHaveBeenCalledWith('/api/admin/impersonate-user', {
      method: 'POST',
      body: { userId: 'u-1' },
    });
  });

  it('POSTs to /api/admin/stop-impersonating', async () => {
    await stopImpersonating();
    expect(httpClient).toHaveBeenCalledWith('/api/admin/stop-impersonating', {
      method: 'POST',
    });
  });
});
