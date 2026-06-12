import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import { getMyMemberships } from './me.api.js';

const ORG_ID_A = '0e2e8c4b-7a9a-46e1-9d1e-54b8f7d3a2e0';
const ORG_ID_B = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const mockedHttp = vi.mocked(httpClient);

describe('me api', () => {
  it('getMyMemberships() GETs /api/me/memberships', async () => {
    mockedHttp.mockResolvedValueOnce([]);
    await getMyMemberships();
    expect(mockedHttp).toHaveBeenCalledWith('/api/me/memberships');
  });

  it('getMyMemberships() parses the response into an array of Membership', async () => {
    mockedHttp.mockResolvedValueOnce([
      { organisationId: ORG_ID_A, role: 'instructor' },
      { organisationId: ORG_ID_B, role: 'orgadmin' },
    ]);
    const result = await getMyMemberships();
    expect(result).toEqual([
      { organisationId: ORG_ID_A, role: 'instructor' },
      { organisationId: ORG_ID_B, role: 'orgadmin' },
    ]);
  });
});
