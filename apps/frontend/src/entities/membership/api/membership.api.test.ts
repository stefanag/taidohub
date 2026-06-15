import { MembershipsRoutes } from '@repo/contracts/routes';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createMembership,
  deleteMembership,
  listMemberships,
  updateMembership,
} from './membership.api.js';

import { httpClient } from '@/shared/api';

const MEMBERSHIP_RESPONSE = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  organisationId: '33333333-3333-4333-8333-333333333333',
  role: 'orgadmin' as const,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('membership api', () => {
  it('listMemberships GETs /api/memberships with query', async () => {
    mockedHttp.mockResolvedValueOnce({ data: [], total: 0 });
    await listMemberships({ userId: MEMBERSHIP_RESPONSE.userId });
    expect(mockedHttp).toHaveBeenCalledWith(MembershipsRoutes.base, {
      query: { userId: MEMBERSHIP_RESPONSE.userId, organisationId: undefined },
    });
  });

  it('createMembership POSTs to /api/memberships', async () => {
    mockedHttp.mockResolvedValueOnce(MEMBERSHIP_RESPONSE);
    await createMembership({
      userId: MEMBERSHIP_RESPONSE.userId,
      organisationId: MEMBERSHIP_RESPONSE.organisationId,
      role: 'orgadmin',
    });
    expect(mockedHttp).toHaveBeenCalledWith(MembershipsRoutes.base, {
      method: 'POST',
      body: {
        userId: MEMBERSHIP_RESPONSE.userId,
        organisationId: MEMBERSHIP_RESPONSE.organisationId,
        role: 'orgadmin',
      },
    });
  });

  it('updateMembership PATCHes /api/memberships/:id', async () => {
    mockedHttp.mockResolvedValueOnce(MEMBERSHIP_RESPONSE);
    await updateMembership(MEMBERSHIP_RESPONSE.id, { role: 'instructor' });
    expect(mockedHttp).toHaveBeenCalledWith(MembershipsRoutes.byId(MEMBERSHIP_RESPONSE.id), {
      method: 'PATCH',
      body: { role: 'instructor' },
    });
  });

  it('deleteMembership DELETEs /api/memberships/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteMembership(MEMBERSHIP_RESPONSE.id);
    expect(mockedHttp).toHaveBeenCalledWith(MembershipsRoutes.byId(MEMBERSHIP_RESPONSE.id), {
      method: 'DELETE',
    });
  });

  it('deleteMembership passes ?confirm=true when given the flag', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteMembership('m-1', { confirm: true });
    expect(mockedHttp).toHaveBeenCalledWith(
      MembershipsRoutes.byId('m-1'),
      expect.objectContaining({
        method: 'DELETE',
        query: { confirm: true },
      }),
    );
  });

  it('deleteMembership omits confirm when not given', async () => {
    mockedHttp.mockClear();
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteMembership('m-1');
    const call = mockedHttp.mock.calls[0]!;
    expect(call[0]).toBe(MembershipsRoutes.byId('m-1'));
    expect(call[1]).toMatchObject({ method: 'DELETE' });
    expect(call[1]).not.toHaveProperty('query');
  });
});
