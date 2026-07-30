import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  getAdminFeatureFlags,
  getFeatureFlags,
  updateFeatureFlag,
} from './feature-flags.api.js';

import { httpClient } from '@/shared/api';

const FLAG_ROW = {
  code: 'grading-history' as const,
  enabled: false,
  updatedAt: '2026-06-08T10:00:00.000Z',
  updatedBy: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com' },
};

const FLAG_MAP = {
  'grading-history': false,
  'grading-history-verification': false,
  'instructor-feedback': true,
};

const mockedHttp = vi.mocked(httpClient);

describe('feature-flags api', () => {
  it('getFeatureFlags GETs /api/feature-flags and parses the map', async () => {
    mockedHttp.mockResolvedValueOnce(FLAG_MAP);
    const out = await getFeatureFlags();
    expect(mockedHttp).toHaveBeenCalledWith('/api/feature-flags');
    expect(out['grading-history']).toBe(false);
    expect(out['instructor-feedback']).toBe(true);
  });

  it('getAdminFeatureFlags GETs /api/admin/feature-flags and parses the row list', async () => {
    mockedHttp.mockResolvedValueOnce([FLAG_ROW]);
    const out = await getAdminFeatureFlags();
    expect(mockedHttp).toHaveBeenCalledWith('/api/admin/feature-flags');
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe('grading-history');
    expect(out[0]?.enabled).toBe(false);
  });

  it('updateFeatureFlag PATCHes /api/admin/feature-flags/:code with the input body', async () => {
    mockedHttp.mockResolvedValueOnce({ ...FLAG_ROW, enabled: true });
    const updated = await updateFeatureFlag('grading-history', { enabled: true });
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/admin/feature-flags/grading-history',
      { method: 'PATCH', body: { enabled: true } },
    );
    expect(updated.enabled).toBe(true);
    expect(updated.code).toBe('grading-history');
  });
});
