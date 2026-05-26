import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createBeltSystem,
  deleteBeltSystem,
  getBeltSystems,
  updateBeltSystem,
} from './belt-system.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('belt-system api', () => {
  it('getBeltSystems GETs /api/belt-systems', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getBeltSystems();
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems');
    expect(out[0]?.code).toBe('kyu');
  });

  it('createBeltSystem POSTs /api/belt-systems', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await createBeltSystem({
      code: 'kyu',
      nameEn: 'Kyu',
      nameSv: 'Kyu',
      nameFi: 'Kyu',
      sortOrder: 1,
    });
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems', {
      method: 'POST',
      body: { code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu', sortOrder: 1 },
    });
  });

  it('updateBeltSystem PATCHes /api/belt-systems/:id', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await updateBeltSystem('7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', { sortOrder: 5 });
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems/7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', {
      method: 'PATCH',
      body: { sortOrder: 5 },
    });
  });

  it('deleteBeltSystem DELETEs /api/belt-systems/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteBeltSystem('7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5');
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems/7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5', {
      method: 'DELETE',
    });
  });
});
