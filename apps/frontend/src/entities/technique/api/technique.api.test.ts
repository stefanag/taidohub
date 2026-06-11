import type { CreateTechniqueInput } from '@repo/contracts/techniques';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import {
  createTechnique,
  deleteTechnique,
  getTechnique,
  getTechniques,
} from './technique.api.js';

const STUB_TECHNIQUE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  createdByOrganisationId: null,
  isKihon: false,
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
    technique_type: [],
    sotai_category: [],
    attack_type: [],
  },
  classifications: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('technique api', () => {
  it('getTechniques() with no opts GETs /api/techniques with no query string', async () => {
    mockedHttp.mockResolvedValueOnce([STUB_TECHNIQUE]);
    const out = await getTechniques();
    expect(mockedHttp).toHaveBeenCalledWith('/api/techniques');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(STUB_TECHNIQUE.id);
  });

  it('getTechniques({ classificationIds }) appends ?classificationIds=a,b', async () => {
    mockedHttp.mockResolvedValueOnce([STUB_TECHNIQUE]);
    const out = await getTechniques({ classificationIds: ['a', 'b'] });
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/techniques?classificationIds=a%2Cb',
    );
    expect(out).toHaveLength(1);
  });

  it('getTechnique(id) GETs /api/techniques/:id', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_TECHNIQUE);
    const out = await getTechnique('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/techniques/id-1');
    expect(out.id).toBe(STUB_TECHNIQUE.id);
  });

  it('createTechnique(input) POSTs /api/techniques with the input body', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_TECHNIQUE);
    const input: CreateTechniqueInput = {
      classificationIds: ['550e8400-e29b-41d4-a716-446655440001'],
      isKihon: false,
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
    const out = await createTechnique(input);
    expect(mockedHttp).toHaveBeenCalledWith('/api/techniques', {
      method: 'POST',
      body: input,
    });
    expect(out.id).toBe(STUB_TECHNIQUE.id);
  });

  it('deleteTechnique(id) DELETEs /api/techniques/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteTechnique('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/techniques/id-1', {
      method: 'DELETE',
    });
  });
});
