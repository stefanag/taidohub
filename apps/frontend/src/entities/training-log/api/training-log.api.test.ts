import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createTrainingSession,
  getTrainingGoal,
  listTrainingSessions,
} from './training-log.api.js';

import { httpClient } from '@/shared/api';

const mockedHttp = vi.mocked(httpClient);
const ID = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';
const SESSION = {
  id: ID,
  date: '2026-11-26',
  durationMinutes: 90,
  kind: 'club',
  notes: null,
  items: [{ contentType: 'pattern', contentId: ID }],
  createdAt: '2026-11-26T19:00:00.000Z',
  updatedAt: '2026-11-26T19:00:00.000Z',
};

describe('training log api', () => {
  it('lists sessions in a date range', async () => {
    mockedHttp.mockResolvedValueOnce([SESSION]);
    const out = await listTrainingSessions({ from: '2026-11-01' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/training-sessions', {
      query: { from: '2026-11-01', to: undefined },
    });
    expect(out[0]!.items).toHaveLength(1);
  });

  it('posts a new session', async () => {
    mockedHttp.mockResolvedValueOnce(SESSION);
    const input = { date: '2026-11-26', kind: 'club' as const, items: [] };
    await createTrainingSession(input);
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/training-sessions', {
      method: 'POST',
      body: input,
    });
  });

  it('rejects a goal response that does not match the contract', async () => {
    mockedHttp.mockResolvedValueOnce({
      targetRankId: 'nope',
      targetDate: null,
      sessionsPerWeek: null,
    });
    await expect(getTrainingGoal()).rejects.toThrow();
  });
});
