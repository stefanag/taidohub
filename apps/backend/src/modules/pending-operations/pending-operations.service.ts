import { subject } from '@casl/ability';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type PendingOperation,
  PendingOperationSchema,
  type PendingOperationStatus,
  type ProposeRankEntryInput,
  type RankEntryPreview,
} from '@repo/contracts/pending-operations';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { type DbPendingOperation } from '../../infrastructure/database/schema/index.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { BeltRanksService } from '../belt-catalog/belt-ranks.service.js';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { RankHistoryService } from '../rank-history/rank-history.service.js';

import { PendingOperationsRepository } from './pending-operations.repository.js';

const ENTITY_TYPE = 'pending_operation';

/**
 * Writes proposed by AI clients, held until their proposer approves them.
 *
 * - `proposeRankEntry` checks now that the proposer could record the entry
 *   (so the agent gets an immediate, honest answer), resolves names for the
 *   preview and stores the proposal. Nothing is written to rank history.
 * - `approve` (web app only) re-runs `RankHistoryService.create` as the
 *   proposer, so permissions are checked against the state at approval, and
 *   commits the new row, the status change and both audit rows together. If
 *   the write is refused the proposal is marked `failed` with the reason.
 * - `reject` marks the proposal `rejected`.
 *
 * Only the proposer may approve or reject (see `PendingOperationAbilityRules`).
 */
@Injectable()
export class PendingOperationsService {
  constructor(
    private readonly repo: PendingOperationsRepository,
    private readonly rankHistory: RankHistoryService,
    private readonly ranks: BeltRanksService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditLogService,
    private readonly abilities: AbilityFactory,
  ) {}

  async proposeRankEntry(
    input: ProposeRankEntryInput,
    actor: AuthenticatedUser,
  ): Promise<PendingOperation> {
    await this.assertGradingHistoryEnabled();
    const { studentUserId, ...entry } = input;
    await this.rankHistory.assertCanRecord(studentUserId, actor);

    const studentName = await this.repo.findUserName(studentUserId);
    if (studentName === undefined) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `No user with id ${studentUserId}.` },
      });
    }
    const rank = await this.ranks.findById(entry.rankId);
    const preview: RankEntryPreview = {
      studentUserId,
      studentName,
      rankId: rank.id,
      rankName: rank.nameEn || rank.nameRomaji,
      date: entry.date,
      shogoTitle: entry.shogoTitle ?? null,
      examinerName: entry.examinerName ?? null,
      organisationName: entry.organisationName ?? null,
      notes: entry.notes ?? null,
    };

    return this.repo.transaction(async (tx) => {
      const row = await this.repo.insert(
        {
          type: 'rank_history.create',
          params: input,
          preview,
          createdByUserId: actor.id,
          createdVia: 'mcp',
        },
        tx,
      );
      const created = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: ENTITY_TYPE,
        entityId: row.id,
        action: 'create',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        actingUserId: null,
        before: null,
        after: created,
        origin: 'mcp',
      });
      return created;
    });
  }

  async listMine(
    actor: AuthenticatedUser,
    status?: PendingOperationStatus,
  ): Promise<PendingOperation[]> {
    const rows = await this.repo.listByCreator(actor.id, status);
    return rows.map((row) => this.toApi(row));
  }

  async approve(id: string, actor: AuthenticatedUser): Promise<PendingOperation> {
    await this.assertGradingHistoryEnabled();
    try {
      return await this.repo.transaction(async (tx) => {
        const row = await this.requireDecidable(id, actor, tx);
        const { studentUserId, ...entry } = PendingOperationSchema.shape.params.parse(row.params);
        const created = await this.rankHistory.create(studentUserId, entry, actor, tx);
        await this.audit.record({
          tx,
          entityType: 'rank_history',
          entityId: created.id,
          action: 'create',
          userId: studentUserId,
          impersonatedById: actor.impersonatedBy ?? null,
          actingUserId: actor.id === studentUserId ? null : actor.id,
          before: null,
          after: created,
          origin: 'mcp',
        });
        return this.decide(
          row,
          { status: 'approved', resultEntityId: created.id, error: null, decidedAt: new Date() },
          actor,
          tx,
        );
      });
    } catch (err) {
      // The write was refused (permissions changed, rank removed, …). Keep the
      // proposal and record why, unless the refusal was about the proposal
      // itself (not found, not the proposer, already decided).
      if (!(err instanceof HttpException) || PROPOSAL_ERRORS.has(err)) throw err;
      const row = await this.repo.findById(id);
      if (!row || row.status !== 'pending') throw err;
      return this.repo.transaction((tx) =>
        this.decide(
          row,
          { status: 'failed', resultEntityId: null, error: messageOf(err), decidedAt: new Date() },
          actor,
          tx,
        ),
      );
    }
  }

  async reject(id: string, actor: AuthenticatedUser): Promise<PendingOperation> {
    return this.repo.transaction(async (tx) => {
      const row = await this.requireDecidable(id, actor, tx);
      return this.decide(
        row,
        { status: 'rejected', resultEntityId: null, error: null, decidedAt: new Date() },
        actor,
        tx,
      );
    });
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async requireDecidable(
    id: string,
    actor: AuthenticatedUser,
    tx: DrizzleExecutor,
  ): Promise<DbPendingOperation> {
    const row = await this.repo.findByIdForUpdate(id, tx);
    // A proposal someone else made reads as missing, so ids are not probed.
    const ability = this.abilities.createForUser(actor);
    if (
      !row ||
      row.createdByUserId !== actor.id ||
      ability.cannot('update', subject('PendingOperation', { id: row.id, createdByUserId: row.createdByUserId }))
    ) {
      throw proposalError(
        new NotFoundException({
          error: { code: 'NOT_FOUND', message: `No pending operation ${id}.` },
        }),
      );
    }
    if (row.status !== 'pending') {
      throw proposalError(
        new ConflictException({
          error: { code: 'CONFLICT', message: `Operation ${id} is already ${row.status}.` },
        }),
      );
    }
    return row;
  }

  private async decide(
    row: DbPendingOperation,
    decision: Parameters<PendingOperationsRepository['decide']>[1],
    actor: AuthenticatedUser,
    tx: DrizzleExecutor,
  ): Promise<PendingOperation> {
    const updated = await this.repo.decide(row.id, decision, tx);
    const after = this.toApi(updated);
    await this.audit.record({
      tx,
      entityType: ENTITY_TYPE,
      entityId: row.id,
      action: 'update',
      userId: actor.id,
      impersonatedById: actor.impersonatedBy ?? null,
      actingUserId: null,
      before: this.toApi(row),
      after,
      origin: 'web',
    });
    return after;
  }

  private async assertGradingHistoryEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled('grading-history'))) {
      throw new ForbiddenException({
        error: { code: 'FEATURE_DISABLED', message: 'Grading history is not enabled.' },
      });
    }
  }

  private toApi(row: DbPendingOperation): PendingOperation {
    return PendingOperationSchema.parse({
      id: row.id,
      type: row.type,
      status: row.status,
      params: row.params,
      preview: row.preview,
      createdByUserId: row.createdByUserId,
      createdVia: row.createdVia,
      resultEntityId: row.resultEntityId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    });
  }
}

/**
 * Refusals about the proposal itself (missing, not yours, already decided),
 * as opposed to a refusal of the write it asks for. Only the latter marks the
 * proposal `failed`.
 */
const PROPOSAL_ERRORS = new WeakSet<HttpException>();

function proposalError(err: HttpException): HttpException {
  PROPOSAL_ERRORS.add(err);
  return err;
}

function messageOf(err: HttpException): string {
  const body = err.getResponse() as { error?: { message?: string } } | string;
  return typeof body === 'object' && body.error?.message ? body.error.message : err.message;
}
