import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbPendingOperation } from '../../infrastructure/database/schema/index.js';
import { type AuditLogService } from '../audit-log/audit-log.service.js';
import { type BeltRanksService } from '../belt-catalog/belt-ranks.service.js';
import { type FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { type RankHistoryService } from '../rank-history/rank-history.service.js';

import { PendingOperationAbilityRules } from './pending-operations.abilities.js';
import { type PendingOperationsRepository } from './pending-operations.repository.js';
import { PendingOperationsService } from './pending-operations.service.js';

const RANK_ID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const OP_ID = '1d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ROW_ID = '2d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const actor: AuthenticatedUser = {
  id: 'admin-1',
  email: 'a@example.com',
  emailVerified: true,
  name: 'Admin',
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null,
  memberships: [{ organisationId: 'org-a', role: 'orgadmin' }],
};

const params = { studentUserId: 'student-1', rankId: RANK_ID, date: '2026-11-20' };
const preview = {
  studentUserId: 'student-1',
  studentName: 'Student',
  rankId: RANK_ID,
  rankName: '4th Kyu',
  date: '2026-11-20',
  shogoTitle: null,
  examinerName: null,
  organisationName: null,
  notes: null,
};

function row(overrides: Partial<DbPendingOperation> = {}): DbPendingOperation {
  return {
    id: OP_ID,
    type: 'rank_history.create',
    status: 'pending',
    params,
    preview,
    createdByUserId: actor.id,
    createdVia: 'mcp',
    resultEntityId: null,
    error: null,
    createdAt: new Date('2026-11-24T10:00:00Z'),
    decidedAt: null,
    ...overrides,
  };
}

function build() {
  const repo = {
    transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn('tx')),
    insert: vi.fn(async (values: Partial<DbPendingOperation>) => row(values)),
    findById: vi.fn(async () => row()),
    findByIdForUpdate: vi.fn(async () => row()),
    listByCreator: vi.fn(async () => [row()]),
    decide: vi.fn(async (_id: string, decision: Partial<DbPendingOperation>) => row(decision)),
    findUserName: vi.fn(async () => 'Student'),
  };
  const rankHistory = {
    assertCanRecord: vi.fn(async () => undefined),
    create: vi.fn(async () => ({ id: ROW_ID })),
  };
  const ranks = { findById: vi.fn(async () => ({ id: RANK_ID, nameEn: '4th Kyu', nameRomaji: 'Yonkyu' })) };
  const flags = { isEnabled: vi.fn(async () => true) };
  const audit = { record: vi.fn(async () => undefined) };
  const abilities = {
    createForUser: vi.fn((user: AuthenticatedUser) => {
      const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
      new PendingOperationAbilityRules().contributeTo(builder, user);
      return builder.build();
    }),
  };
  const service = new PendingOperationsService(
    repo as unknown as PendingOperationsRepository,
    rankHistory as unknown as RankHistoryService,
    ranks as unknown as BeltRanksService,
    flags as unknown as FeatureFlagsService,
    audit as unknown as AuditLogService,
    abilities as unknown as AbilityFactory,
  );
  return { service, repo, rankHistory, flags, audit };
}

describe('PendingOperationsService', () => {
  let h: ReturnType<typeof build>;

  beforeEach(() => {
    h = build();
  });

  describe('proposeRankEntry', () => {
    it('checks the write now, stores a preview and audits with origin mcp, without writing rank history', async () => {
      const op = await h.service.proposeRankEntry(params, actor);

      expect(h.rankHistory.assertCanRecord).toHaveBeenCalledWith('student-1', actor);
      expect(h.rankHistory.create).not.toHaveBeenCalled();
      expect(h.repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rank_history.create', createdByUserId: actor.id, createdVia: 'mcp', preview }),
        'tx',
      );
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'pending_operation', action: 'create', origin: 'mcp' }),
      );
      expect(op.status).toBe('pending');
    });

    it('stores nothing when the proposer may not record for the student', async () => {
      h.rankHistory.assertCanRecord.mockRejectedValue(new ForbiddenException());
      await expect(h.service.proposeRankEntry(params, actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.repo.insert).not.toHaveBeenCalled();
    });

    it('refuses while grading history is switched off', async () => {
      h.flags.isEnabled.mockResolvedValue(false);
      await expect(h.service.proposeRankEntry(params, actor)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('approve', () => {
    it('writes the entry as the proposer in the same transaction and marks the proposal approved', async () => {
      const op = await h.service.approve(OP_ID, actor);

      expect(h.rankHistory.create).toHaveBeenCalledWith(
        'student-1',
        { rankId: RANK_ID, date: '2026-11-20' },
        actor,
        'tx',
      );
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'rank_history', entityId: ROW_ID, origin: 'mcp', actingUserId: actor.id }),
      );
      expect(op).toMatchObject({ status: 'approved', resultEntityId: ROW_ID });
    });

    it("treats someone else's proposal as missing", async () => {
      h.repo.findByIdForUpdate.mockResolvedValue(row({ createdByUserId: 'someone-else' }));
      await expect(h.service.approve(OP_ID, actor)).rejects.toBeInstanceOf(NotFoundException);
      expect(h.rankHistory.create).not.toHaveBeenCalled();
      expect(h.repo.decide).not.toHaveBeenCalled();
    });

    it('refuses a proposal that is already decided', async () => {
      h.repo.findByIdForUpdate.mockResolvedValue(row({ status: 'rejected' }));
      await expect(h.service.approve(OP_ID, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(h.repo.decide).not.toHaveBeenCalled();
    });

    it('marks the proposal failed, with the reason, when the write is refused', async () => {
      h.rankHistory.create.mockRejectedValue(
        new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot record history for this user.' } }),
      );
      const op = await h.service.approve(OP_ID, actor);
      expect(op).toMatchObject({ status: 'failed', error: 'Cannot record history for this user.' });
    });
  });

  describe('reject', () => {
    it('marks the proposal rejected without writing', async () => {
      const op = await h.service.reject(OP_ID, actor);
      expect(op.status).toBe('rejected');
      expect(h.rankHistory.create).not.toHaveBeenCalled();
    });
  });
});
