import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  approveJoinRequest,
  createJoinRequest,
  listJoinableClubs,
} from './club-join-requests.api.js';

import { httpClient } from '@/shared/api';

const mockedHttp = vi.mocked(httpClient);
const ID = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';
const CLUB = {
  id: ID,
  shortCode: 'C',
  nameEn: 'Club',
  nameSv: 'Klubb',
  nameFi: 'Seura',
  country: null,
};
const REQUEST = {
  id: ID,
  club: CLUB,
  status: 'pending',
  message: null,
  applicant: { userId: 'u', name: null, email: 'u@example.com', currentRankId: null },
  createdAt: '2026-11-27T10:00:00.000Z',
  decidedAt: null,
};

describe('club join requests api', () => {
  it('lists clubs', async () => {
    mockedHttp.mockResolvedValueOnce([CLUB]);
    expect(await listJoinableClubs()).toEqual([CLUB]);
    expect(mockedHttp).toHaveBeenCalledWith('/api/club-join-requests/clubs');
  });

  it('posts a request and an approval', async () => {
    mockedHttp.mockResolvedValue(REQUEST);
    await createJoinRequest({ organisationId: ID, message: 'Hi' });
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/club-join-requests', {
      method: 'POST',
      body: { organisationId: ID, message: 'Hi' },
    });
    await approveJoinRequest(ID);
    expect(mockedHttp).toHaveBeenLastCalledWith(`/api/club-join-requests/${ID}/approve`, {
      method: 'POST',
    });
  });
});
