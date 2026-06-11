import type { CreatePatternInput } from '@repo/contracts/patterns';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import {
  createPattern,
  deletePattern,
  getPattern,
  getPatterns,
} from './pattern.api.js';

const STUB_PATTERN = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  createdByOrganisationId: null,
  officialBodyOrgId: null,
  isActive: true,
  sortOrder: 0,
  minRankId: null,
  nameJa: '',
  nameRomaji: 'test',
  nameSv: '',
  nameEn: '',
  nameFi: '',
  descriptionSv: '',
  descriptionEn: '',
  descriptionFi: '',
  classificationsByRoot: {
    pattern_type: [],
    hokei_subtype: [],
  },
  classifications: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('pattern api', () => {
  it('getPatterns() with no opts GETs /api/patterns with no query string', async () => {
    mockedHttp.mockResolvedValueOnce([STUB_PATTERN]);
    const out = await getPatterns();
    expect(mockedHttp).toHaveBeenCalledWith('/api/patterns');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(STUB_PATTERN.id);
  });

  it('getPatterns({ classificationIds }) appends ?classificationIds=a,b', async () => {
    mockedHttp.mockResolvedValueOnce([STUB_PATTERN]);
    const out = await getPatterns({ classificationIds: ['a', 'b'] });
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/patterns?classificationIds=a%2Cb',
    );
    expect(out).toHaveLength(1);
  });

  it('getPattern(id) GETs /api/patterns/:id', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_PATTERN);
    const out = await getPattern('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/patterns/id-1');
    expect(out.id).toBe(STUB_PATTERN.id);
  });

  it('createPattern(input) POSTs /api/patterns with the input body', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_PATTERN);
    const input: CreatePatternInput = {
      classificationIds: ['550e8400-e29b-41d4-a716-446655440001'],
      isActive: true,
      sortOrder: 0,
      nameJa: '',
      nameRomaji: 'test',
      nameSv: '',
      nameEn: '',
      nameFi: '',
      descriptionSv: '',
      descriptionEn: '',
      descriptionFi: '',
    };
    const out = await createPattern(input);
    expect(mockedHttp).toHaveBeenCalledWith('/api/patterns', {
      method: 'POST',
      body: input,
    });
    expect(out.id).toBe(STUB_PATTERN.id);
  });

  it('deletePattern(id) DELETEs /api/patterns/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deletePattern('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/patterns/id-1', {
      method: 'DELETE',
    });
  });
});
