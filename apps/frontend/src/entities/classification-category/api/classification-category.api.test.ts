import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  getClassificationCategories,
  updateClassificationCategory,
} from './classification-category.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  parentId: null,
  rootCode: 'attack_type' as const,
  code: 'kick',
  nameEn: 'Kick',
  nameSv: 'Spark',
  nameFi: 'Potku',
  nameJa: '',
  sortOrder: 0,
  isActive: true,
};

const mockedHttp = vi.mocked(httpClient);

describe('classification-category api', () => {
  it('getClassificationCategories GETs /api/classification-categories?root=technique_type', async () => {
    mockedHttp.mockResolvedValueOnce([{ ...ROW, rootCode: 'technique_type' as const }]);
    const out = await getClassificationCategories('technique_type');
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/classification-categories?root=technique_type',
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.rootCode).toBe('technique_type');
  });

  it('getClassificationCategories with includeInactive appends includeInactive=1', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getClassificationCategories('attack_type', { includeInactive: true });
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/classification-categories?root=attack_type&includeInactive=1',
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.rootCode).toBe('attack_type');
  });

  it('updateClassificationCategory PATCHes /api/classification-categories/:id with the patch body', async () => {
    mockedHttp.mockResolvedValueOnce({ ...ROW, nameEn: 'X' });
    const updated = await updateClassificationCategory('id-1', { nameEn: 'X' });
    expect(mockedHttp).toHaveBeenCalledWith(
      '/api/classification-categories/id-1',
      { method: 'PATCH', body: { nameEn: 'X' } },
    );
    expect(updated.nameEn).toBe('X');
  });
});
