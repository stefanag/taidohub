import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  approvePendingOperation,
  listPendingOperations,
  rejectPendingOperation,
} from './pending-operations.api.js';

import { httpClient } from '@/shared/api';

const OP = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'rank_history.create' as const,
  status: 'pending' as const,
  params: { studentUserId: 'u-2', rankId: '22222222-2222-4222-8222-222222222222', date: '2026-11-20' },
  preview: {
    studentUserId: 'u-2',
    studentName: 'Aino',
    rankId: '22222222-2222-4222-8222-222222222222',
    rankName: '4th Kyu',
    date: '2026-11-20',
    shogoTitle: null,
    examinerName: null,
    organisationName: null,
    notes: null,
  },
  createdByUserId: 'u-1',
  createdVia: 'mcp' as const,
  resultEntityId: null,
  error: null,
  createdAt: '2026-11-24T10:00:00.000Z',
  decidedAt: null,
};

const mockedHttp = vi.mocked(httpClient);

describe('pending operations api', () => {
  it('lists the caller’s proposals, optionally by status', async () => {
    mockedHttp.mockResolvedValue({ data: [OP] });
    expect(await listPendingOperations()).toEqual({ data: [OP] });
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/pending-operations');
    await listPendingOperations('pending');
    expect(mockedHttp).toHaveBeenLastCalledWith('/api/pending-operations?status=pending');
  });

  it('approves and rejects by id', async () => {
    mockedHttp.mockResolvedValue({ ...OP, status: 'approved', decidedAt: '2026-11-24T11:00:00.000Z' });
    expect((await approvePendingOperation(OP.id)).status).toBe('approved');
    expect(mockedHttp).toHaveBeenLastCalledWith(`/api/pending-operations/${OP.id}/approve`, { method: 'POST' });

    mockedHttp.mockResolvedValue({ ...OP, status: 'rejected', decidedAt: '2026-11-24T11:00:00.000Z' });
    expect((await rejectPendingOperation(OP.id)).status).toBe('rejected');
    expect(mockedHttp).toHaveBeenLastCalledWith(`/api/pending-operations/${OP.id}/reject`, { method: 'POST' });
  });

  it('refuses a response that does not match the contract', async () => {
    mockedHttp.mockResolvedValue({ data: [{ id: 'nope' }] });
    await expect(listPendingOperations()).rejects.toThrow();
  });
});
