import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createRankHistory,
  deleteRankHistory,
  getGradingHistory,
  unverifyRankHistory,
  updateRankHistory,
  verifyRankHistory,
} from './rank-history.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'external' as const,
  userId: 'u-1',
  rankId: '22222222-2222-4222-8222-222222222222',
  shogoTitle: null,
  date: '2024-09-01',
  result: 'pass' as const,
  notes: null,
  examiner: 'Sensei Tanaka',
  organisationName: 'Kobe Dojo',
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  canVerify: true,
  canEdit: true,
  updatedAt: null,
  updatedByUserId: null,
};

const RH_FULL = {
  id: ROW.id,
  userId: ROW.userId,
  rankId: ROW.rankId,
  shogoTitle: null,
  date: ROW.date,
  result: 'pass' as const,
  source: 'external' as const,
  eventId: null,
  recordedByUserId: 'u-1',
  examinerName: ROW.examiner,
  organisationName: ROW.organisationName,
  notes: null,
  verified: false,
  verifiedByUserId: null,
  verifiedAt: null,
  createdAt: '2026-05-25T08:00:00.000Z',
  updatedAt: null,
  updatedByUserId: null,
};

const mockedHttp = vi.mocked(httpClient);

describe('rank-history api', () => {
  it('getGradingHistory GETs the unified projection', async () => {
    mockedHttp.mockResolvedValueOnce({ data: [ROW] });
    const out = await getGradingHistory('u-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/grading-events/history/u-1');
    expect(out.data[0]?.id).toBe(ROW.id);
  });

  it('createRankHistory POSTs to /api/rank-history/:userId', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await createRankHistory('u-1', {
      rankId: ROW.rankId,
      date: '2024-09-01',
    });
    expect(mockedHttp).toHaveBeenCalledWith('/api/rank-history/u-1', {
      method: 'POST',
      body: { rankId: ROW.rankId, date: '2024-09-01' },
    });
  });

  it('updateRankHistory PATCHes /api/rank-history/:id', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await updateRankHistory(ROW.id, { notes: 'fixed' });
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}`, {
      method: 'PATCH',
      body: { notes: 'fixed' },
    });
  });

  it('deleteRankHistory DELETEs /api/rank-history/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteRankHistory(ROW.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}`, {
      method: 'DELETE',
    });
  });

  it('verifyRankHistory POSTs /api/rank-history/:id/verify', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await verifyRankHistory(ROW.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}/verify`, {
      method: 'POST',
    });
  });

  it('unverifyRankHistory POSTs /api/rank-history/:id/unverify', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await unverifyRankHistory(ROW.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}/unverify`, {
      method: 'POST',
    });
  });
});
