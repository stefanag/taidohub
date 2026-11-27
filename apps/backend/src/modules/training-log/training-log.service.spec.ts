import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type BeltRanksService } from '../belt-catalog/belt-ranks.service.js';
import { type ProgressService } from '../progress/progress.service.js';

import { type TrainingLogRepository, type TrainingSessionRow } from './training-log.repository.js';
import { TrainingLogService } from './training-log.service.js';

const TX = { __tx: true };
const P1 = '11111111-1111-4111-8111-111111111111';

const actor = { id: 'u-1', role: 'user', memberships: [] } as unknown as AuthenticatedUser;

function sessionRow(overrides: Partial<TrainingSessionRow> = {}): TrainingSessionRow {
  return {
    id: 's-1',
    userId: 'u-1',
    date: '2026-11-20',
    durationMinutes: 60,
    kind: 'club',
    notes: null,
    createdAt: new Date('2026-11-20T18:00:00Z'),
    updatedAt: new Date('2026-11-20T18:00:00Z'),
    items: [{ sessionId: 's-1', contentType: 'pattern', contentId: P1 }],
    ...overrides,
  };
}

function build(found: TrainingSessionRow | null = sessionRow()) {
  const repo = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
    listByUser: vi.fn().mockResolvedValue([sessionRow()]),
    findById: vi.fn().mockResolvedValue(found),
    insert: vi.fn().mockResolvedValue('s-1'),
    replace: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    findGoal: vi.fn().mockResolvedValue(null),
    upsertGoal: vi.fn(async (_u: string, f: object) => ({
      userId: 'u-1',
      updatedAt: new Date(),
      ...f,
    })),
  };
  const progress = { markPracticed: vi.fn().mockResolvedValue(undefined) };
  const ranks = { findByKey: vi.fn().mockResolvedValue({}) };
  const abilities = {
    createForUser: vi.fn().mockReturnValue({ relevantRuleFor: () => null, can: () => true }),
  };
  const service = new TrainingLogService(
    repo as unknown as TrainingLogRepository,
    progress as unknown as ProgressService,
    ranks as unknown as BeltRanksService,
    abilities as unknown as AbilityFactory,
  );
  return { service, repo, progress, ranks };
}

describe('TrainingLogService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a session and marks its items practised in the same transaction', async () => {
    const h = build();
    const item = { contentType: 'pattern' as const, contentId: P1 };
    const out = await h.service.create(actor, {
      date: '2026-11-20',
      kind: 'club',
      items: [item, item],
    });

    expect(h.repo.insert).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ kind: 'club' }),
      [item],
      TX,
    );
    expect(h.progress.markPracticed).toHaveBeenCalledWith('u-1', [item], '2026-11-20', TX);
    expect(out.items).toEqual([item]);
    expect(out.createdAt).toBe('2026-11-20T18:00:00.000Z');
  });

  it("treats another user's session as missing", async () => {
    const h = build(sessionRow({ userId: 'u-other' }));
    await expect(h.service.delete(actor, 's-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      h.service.update(actor, 's-1', { date: '2026-11-20', kind: 'own', items: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.repo.delete).not.toHaveBeenCalled();
    expect(h.repo.replace).not.toHaveBeenCalled();
  });

  it('returns empty goals when none are saved and validates the target rank on save', async () => {
    const h = build();
    expect(await h.service.getGoal(actor)).toEqual({
      targetRankId: null,
      targetDate: null,
      sessionsPerWeek: null,
    });

    h.ranks.findByKey.mockRejectedValueOnce(new NotFoundException());
    await expect(
      h.service.setGoal(actor, { targetRankId: P1, targetDate: null, sessionsPerWeek: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.repo.upsertGoal).not.toHaveBeenCalled();
  });
});
