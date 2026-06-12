import type { UpsertProgressInput } from '@repo/contracts/progress';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { HttpError, httpClient } from '@/shared/api';

import {
  deletePatternProgress,
  getProgressList,
  getTechniqueProgress,
  upsertTechniqueProgress,
} from './progress.api.js';

const TECHNIQUE_ID = '550e8400-e29b-41d4-a716-446655440001';

const STUB_PROGRESS = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user-abc',
  contentType: 'technique' as const,
  techniqueId: TECHNIQUE_ID,
  patternId: null,
  status: 'learning' as const,
  notes: '',
  lastPracticedAt: null,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('progress api', () => {
  it('getProgressList() with no contentType GETs /api/progress with no query string', async () => {
    mockedHttp.mockResolvedValueOnce([]);
    await getProgressList();
    expect(mockedHttp).toHaveBeenCalledWith('/api/progress');
  });

  it('getProgressList("technique") appends ?contentType=technique', async () => {
    mockedHttp.mockResolvedValueOnce([]);
    await getProgressList('technique');
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/progress?contentType=technique',
    );
  });

  it('upsertTechniqueProgress PUTs body to /api/progress/techniques/:id', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_PROGRESS);
    const input: UpsertProgressInput = {
      status: 'learning',
      notes: '',
      lastPracticedAt: null,
    };
    await upsertTechniqueProgress(TECHNIQUE_ID, input);
    expect(mockedHttp).toHaveBeenCalledWith(
      `/api/progress/techniques/${TECHNIQUE_ID}`,
      { method: 'PUT', body: input },
    );
  });

  it('getTechniqueProgress returns null when httpClient throws a 404 HttpError', async () => {
    const err = new HttpError(404, {
      code: 'NOT_FOUND',
      message: 'No progress row.',
    });
    mockedHttp.mockRejectedValueOnce(err);
    const result = await getTechniqueProgress(TECHNIQUE_ID);
    expect(result).toBeNull();
  });

  it('getTechniqueProgress re-throws non-404 HttpError', async () => {
    const err = new HttpError(500, {
      code: 'INTERNAL',
      message: 'boom',
    });
    mockedHttp.mockRejectedValueOnce(err);
    await expect(getTechniqueProgress(TECHNIQUE_ID)).rejects.toBe(err);
  });

  it('deletePatternProgress DELETEs /api/progress/patterns/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deletePatternProgress('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/progress/patterns/id-1', {
      method: 'DELETE',
    });
  });
});
