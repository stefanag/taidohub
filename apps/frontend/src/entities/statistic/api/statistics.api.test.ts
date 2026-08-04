import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  getOrganisationStats,
  getOrganisationTrends,
  getPlatformStats,
  getUserStats,
  getUserTrends,
  rebuildStats,
} from './statistics.api.js';

import { httpClient } from '@/shared/api';

const RANK = {
  id: '11111111-1111-4111-8111-111111111111',
  nameRomaji: 'Kyu 9',
  nameEn: '9th Kyu',
  sortOrder: 0,
};

const ORG_METRICS = {
  membershipCount: { student: 10, instructor: 2, orgadmin: 1 },
  gradingEventsMonthToDate: 5,
  activeUsersLast30Days: 8,
  feedbackThreadsOpenedMonthToDate: 3,
};

const PLATFORM_STATS = {
  scope: { type: 'platform' as const },
  metrics: ORG_METRICS,
  ranks: [{ rank: RANK, count: 4 }],
  updatedAt: '2026-06-08T10:00:00.000Z',
};

const ORG_ID = '22222222-2222-4222-8222-222222222222';

const ORGANISATION_STATS = {
  scope: { type: 'organisation' as const, id: ORG_ID, name: 'Dojo A' },
  metrics: ORG_METRICS,
  ranks: [{ rank: RANK, count: 2 }],
  updatedAt: '2026-06-08T10:00:00.000Z',
};

const USER_ID = 'user-1';

const USER_STATS = {
  scope: { type: 'user' as const, id: USER_ID, name: 'Ada Lovelace' },
  coverageByRank: [{ rank: RANK, coveragePct: 50 }],
  updatedAt: '2026-06-08T10:00:00.000Z',
};

const TREND_RESPONSE = {
  metric: 'gradingEvents',
  dimensionKey: '',
  points: [{ year: 2026, month: 6, value: 3 }],
};

const REBUILD_RESPONSE = { ok: true as const, durationMs: 42 };

const mockedHttp = vi.mocked(httpClient);

describe('statistics api', () => {
  it('getPlatformStats GETs /api/statistics/platform and parses the response', async () => {
    mockedHttp.mockResolvedValueOnce(PLATFORM_STATS);
    const out = await getPlatformStats();
    expect(mockedHttp).toHaveBeenCalledWith('/api/statistics/platform');
    expect(out.scope.type).toBe('platform');
    expect(out.metrics.membershipCount.student).toBe(10);
  });

  it('getOrganisationStats GETs /api/statistics/organisation/:id and parses the response', async () => {
    mockedHttp.mockResolvedValueOnce(ORGANISATION_STATS);
    const out = await getOrganisationStats(ORG_ID);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/statistics/organisation/${ORG_ID}`);
    expect(out.scope.type).toBe('organisation');
    if (out.scope.type === 'organisation') {
      expect(out.scope.id).toBe(ORG_ID);
    }
  });

  it('getOrganisationTrends GETs /api/statistics/organisation/:id/trends with the query string', async () => {
    mockedHttp.mockResolvedValueOnce(TREND_RESPONSE);
    const out = await getOrganisationTrends(ORG_ID, {
      metric: 'gradingEvents',
      dimensionKey: 'rank',
      months: 6,
    });
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/statistics/organisation/${ORG_ID}/trends?metric=gradingEvents&dimensionKey=rank&months=6`,
    );
    expect(out.points).toHaveLength(1);
  });

  it('getOrganisationTrends omits unspecified optional fields from the query string', async () => {
    mockedHttp.mockResolvedValueOnce(TREND_RESPONSE);
    await getOrganisationTrends(ORG_ID, { metric: 'gradingEvents' });
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/statistics/organisation/${ORG_ID}/trends?metric=gradingEvents`,
    );
  });

  it('getUserStats GETs /api/statistics/user/:id and parses the response', async () => {
    mockedHttp.mockResolvedValueOnce(USER_STATS);
    const out = await getUserStats(USER_ID);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/statistics/user/${USER_ID}`);
    expect(out.scope.type).toBe('user');
    expect(out.coverageByRank).toHaveLength(1);
  });

  it('getUserTrends GETs /api/statistics/user/:id/trends with the query string', async () => {
    mockedHttp.mockResolvedValueOnce(TREND_RESPONSE);
    const out = await getUserTrends(USER_ID, { metric: 'gradingEvents', months: 12 });
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/statistics/user/${USER_ID}/trends?metric=gradingEvents&months=12`,
    );
    expect(out.metric).toBe('gradingEvents');
  });

  it('rebuildStats POSTs /api/admin/statistics/rebuild and parses the response', async () => {
    mockedHttp.mockResolvedValueOnce(REBUILD_RESPONSE);
    const out = await rebuildStats();
    expect(mockedHttp).toHaveBeenCalledWith('/api/admin/statistics/rebuild', {
      method: 'POST',
    });
    expect(out.ok).toBe(true);
    expect(out.durationMs).toBe(42);
  });
});
