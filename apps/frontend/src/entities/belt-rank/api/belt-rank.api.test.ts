import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  getPublicRank,
  updateBeltRank,
} from './belt-rank.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  organisationId: null,
  systemId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f4',
  level: 1,
  sortOrder: 10,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
  beltColor: '#FFFFFF',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('belt-rank api', () => {
  it('getBeltRanks GETs /api/ranks', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getBeltRanks();
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks');
    expect(out[0]?.nameRomaji).toBe('Jukyu');
  });

  it('getBeltRank GETs /api/ranks/:id', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await getBeltRank('7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5');
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks/7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5');
  });

  it('createBeltRank POSTs /api/ranks', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    const input = {
      systemId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f4',
      level: 1,
      nameRomaji: 'Jukyu',
      beltColor: '#FFFFFF',
      nameEn: '10th Kyu',
      nameSv: '10 Kyu',
      nameFi: '10. Kyu',
      sortOrder: 10,
      nameJa: null,
      descriptionEn: null,
      descriptionSv: null,
      descriptionFi: null,
      publiclyVisible: false,
    };
    await createBeltRank(input);
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks', {
      method: 'POST',
      body: input,
    });
  });

  it('updateBeltRank PATCHes /api/ranks/:id', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await updateBeltRank('7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', { sortOrder: 99 });
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks/7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', {
      method: 'PATCH',
      body: { sortOrder: 99 },
    });
  });

  it('deleteBeltRank DELETEs /api/ranks/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteBeltRank('7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5');
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks/7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', { method: 'DELETE' });
  });

  it('getPublicRank GETs /api/public/ranks/:slug', async () => {
    const PUBLIC_PAYLOAD = {
      rank: ROW,
      system: { id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f4', code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu' },
      organisation: null,
    };
    mockedHttp.mockResolvedValueOnce(PUBLIC_PAYLOAD);
    const out = await getPublicRank('jukyu');
    expect(mockedHttp).toHaveBeenCalledWith('/api/public/ranks/jukyu');
    expect(out.rank.nameRomaji).toBe('Jukyu');
  });
});
