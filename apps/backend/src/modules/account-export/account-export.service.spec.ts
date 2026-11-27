import { describe, expect, it, vi } from 'vitest';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { AccountExportService } from './account-export.service.js';

describe('AccountExportService', () => {
  it('reads every part with the user as actor', async () => {
    const actor = { id: 'u-1', locale: 'sv' } as AuthenticatedUser;
    const users = {
      findOne: vi
        .fn()
        .mockResolvedValue({
          id: 'u-1',
          email: 'e',
          name: 'N',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
    };
    const profile = { getOwn: vi.fn().mockResolvedValue({ userId: 'u-1' }) };
    const memberships = { list: vi.fn().mockResolvedValue({ data: [{ id: 'm' }], total: 1 }) };
    const rankHistory = { list: vi.fn().mockResolvedValue([{ id: 'h' }]) };
    const progress = { list: vi.fn().mockResolvedValue([]) };
    const trainingLog = {
      list: vi.fn().mockResolvedValue([]),
      getGoal: vi.fn().mockResolvedValue({}),
    };
    const legal = { listOwnAcknowledgements: vi.fn().mockResolvedValue([]) };
    const service = new AccountExportService(
      users as never,
      profile as never,
      memberships as never,
      rankHistory as never,
      progress as never,
      trainingLog as never,
      legal as never,
    );

    const out = await service.export(actor);

    expect(users.findOne).toHaveBeenCalledWith('u-1', actor);
    expect(memberships.list).toHaveBeenCalledWith({ userId: 'u-1' }, actor);
    expect(rankHistory.list).toHaveBeenCalledWith('u-1', actor);
    expect(legal.listOwnAcknowledgements).toHaveBeenCalledWith('u-1');
    expect(out.account).toEqual({
      id: 'u-1',
      email: 'e',
      name: 'N',
      locale: 'sv',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(out.memberships).toEqual([{ id: 'm' }]);
  });
});
