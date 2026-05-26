import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createShogoTitle,
  deleteShogoTitle,
  getShogoTitles,
  updateShogoTitle,
} from './shogo-title.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f4',
  sortOrder: 1,
};

const mockedHttp = vi.mocked(httpClient);

describe('shogo-title api', () => {
  it('getShogoTitles GETs /api/shogo-titles', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getShogoTitles();
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles');
    expect(out[0]?.nameEn).toBe('Renshi');
  });

  it('createShogoTitle POSTs /api/shogo-titles', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    const input = {
      code: 'renshi',
      nameEn: 'Renshi',
      nameSv: 'Renshi',
      nameFi: 'Renshi',
      nameJa: '錬士',
      minRankId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f4',
      sortOrder: 1,
    };
    await createShogoTitle(input);
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles', {
      method: 'POST',
      body: input,
    });
  });

  it('updateShogoTitle PATCHes /api/shogo-titles/:code', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await updateShogoTitle('renshi', { sortOrder: 99 });
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles/renshi', {
      method: 'PATCH',
      body: { sortOrder: 99 },
    });
  });

  it('deleteShogoTitle DELETEs /api/shogo-titles/:code', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteShogoTitle('renshi');
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles/renshi', {
      method: 'DELETE',
    });
  });
});
