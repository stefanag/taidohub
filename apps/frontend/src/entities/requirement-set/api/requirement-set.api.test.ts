import type {
  CloneRequirementSetInput,
  CreateRequirementSetInput,
  UpdateRequirementSetInput,
} from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { httpClient } from '@/shared/api';

import {
  activateRequirementSet,
  cloneRequirementSet,
  createRequirementSet,
  deactivateRequirementSet,
  deleteRequirementSet,
  getRequirementSetById,
  getRequirementSets,
  updateRequirementSet,
} from './requirement-set.api.js';

const STUB_REQUIREMENT_SET = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Set',
  organisationId: null,
  effectiveDate: '2026-01-01',
  isActive: true,
  clonedFromId: null,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('requirement-set api', () => {
  it('getRequirementSets() GETs /api/requirement-sets', async () => {
    mockedHttp.mockResolvedValueOnce([STUB_REQUIREMENT_SET]);
    const out = await getRequirementSets();
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(STUB_REQUIREMENT_SET.id);
  });

  it('getRequirementSetById(id) GETs /api/requirement-sets/:id', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_REQUIREMENT_SET);
    const out = await getRequirementSetById('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets/id-1');
    expect(out.id).toBe(STUB_REQUIREMENT_SET.id);
  });

  it('createRequirementSet(body) POSTs /api/requirement-sets with the body', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_REQUIREMENT_SET);
    const body: CreateRequirementSetInput = {
      name: 'Test Set',
      organisationId: null,
      effectiveDate: '2026-01-01',
    };
    const out = await createRequirementSet(body);
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets', {
      method: 'POST',
      body,
    });
    expect(out.id).toBe(STUB_REQUIREMENT_SET.id);
  });

  it('updateRequirementSet(id, body) PATCHes /api/requirement-sets/:id with the body', async () => {
    mockedHttp.mockResolvedValueOnce(STUB_REQUIREMENT_SET);
    const body: UpdateRequirementSetInput = { name: 'Renamed Set' };
    const out = await updateRequirementSet('id-1', body);
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets/id-1', {
      method: 'PATCH',
      body,
    });
    expect(out.id).toBe(STUB_REQUIREMENT_SET.id);
  });

  it('deleteRequirementSet(id) DELETEs /api/requirement-sets/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteRequirementSet('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets/id-1', {
      method: 'DELETE',
    });
  });

  it('activateRequirementSet(id) POSTs /api/requirement-sets/:id/activate', async () => {
    mockedHttp.mockResolvedValueOnce({ ...STUB_REQUIREMENT_SET, isActive: true });
    const out = await activateRequirementSet('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets/id-1/activate', {
      method: 'POST',
    });
    expect(out.isActive).toBe(true);
  });

  it('deactivateRequirementSet(id) POSTs /api/requirement-sets/:id/deactivate', async () => {
    mockedHttp.mockResolvedValueOnce({ ...STUB_REQUIREMENT_SET, isActive: false });
    const out = await deactivateRequirementSet('id-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets/id-1/deactivate', {
      method: 'POST',
    });
    expect(out.isActive).toBe(false);
  });

  it('cloneRequirementSet(id, body) POSTs /api/requirement-sets/:id/clone with the body', async () => {
    mockedHttp.mockResolvedValueOnce({
      ...STUB_REQUIREMENT_SET,
      id: '550e8400-e29b-41d4-a716-446655440001',
      clonedFromId: STUB_REQUIREMENT_SET.id,
    });
    const body: CloneRequirementSetInput = { name: 'Cloned Set' };
    const out = await cloneRequirementSet('id-1', body);
    expect(mockedHttp).toHaveBeenCalledWith('/api/requirement-sets/id-1/clone', {
      method: 'POST',
      body,
    });
    expect(out.clonedFromId).toBe(STUB_REQUIREMENT_SET.id);
  });
});
