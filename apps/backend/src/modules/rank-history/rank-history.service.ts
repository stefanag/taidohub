import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateRankHistoryInput,
  RankHistory,
  UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';
import { eq } from 'drizzle-orm';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  type DbRankHistory,
  userProfile,
} from '../../infrastructure/database/schema/index.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';
import {
  RankHistoryRepository,
  type RankHistoryWritePatch,
} from './rank-history.repository.js';

@Injectable()
export class RankHistoryService {
  constructor(
    private readonly repo: RankHistoryRepository,
    private readonly auth: RankHistoryAuthService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async list(subjectUserId: string, actor: AuthenticatedUser): Promise<RankHistory[]> {
    const allowed = await this.auth.canRead(actor, subjectUserId);
    if (!allowed) {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot read history for this user.' } });
    }
    const rows = await this.repo.listByUser(subjectUserId);
    return rows.map((r) => this.toApi(r));
  }

  async create(
    subjectUserId: string,
    input: CreateRankHistoryInput,
    actor: AuthenticatedUser,
  ): Promise<RankHistory> {
    // Recording-permission rule (spec §7.1 notes): actor may record for self
    // or for a subject they can verify for (minus the recorder ≠  verifier
    // gate, which is only relevant at verify time). Sysadmin always allowed.
    const isSelf = actor.id === subjectUserId;
    if (!isSelf) {
      const allowedToRead = await this.auth.canRead(actor, subjectUserId);
      const isSysadmin = actor.role === 'sysadmin';
      if (!isSysadmin && !allowedToRead) {
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: 'Cannot record history for this user.' },
        });
      }
    }

    return this.db.transaction(async (tx) => {
      const row = await this.repo.insert(
        {
          userId: subjectUserId,
          rankId: input.rankId,
          shogoTitle: input.shogoTitle ?? null,
          date: input.date,
          result: 'pass',
          source: 'external',
          eventId: null,
          recordedByUserId: actor.id,
          examinerName: input.examinerName ?? null,
          organisationName: input.organisationName ?? null,
          notes: input.notes ?? null,
          verified: false,
          verifiedByUserId: null,
          verifiedAt: null,
        },
        tx,
      );
      return this.toApi(row);
    });
  }

  async update(
    id: string,
    input: UpdateRankHistoryInput,
    actor: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows are immutable through this API.' } });
      }
      if (!this.auth.canEdit(actor, row)) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot edit this row.' } });
      }

      const changesVerificationContent =
        ('rankId' in input && input.rankId !== row.rankId) ||
        ('date' in input && input.date !== row.date) ||
        ('shogoTitle' in input && (input.shogoTitle ?? null) !== row.shogoTitle);

      const patch = this.buildWritePatch(input);
      patch.updatedAt = new Date();
      patch.updatedByUserId = actor.id;

      if (row.verified && changesVerificationContent) {
        patch.verified = false;
        patch.verifiedByUserId = null;
        patch.verifiedAt = null;
      }

      const updated = await this.repo.update(id, patch, tx);
      if (!updated) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }

      // Shogo recompute when the row's verified-shogo footprint moved.
      const oldShogo = row.shogoTitle;
      const newShogo = 'shogoTitle' in input ? input.shogoTitle ?? null : oldShogo;
      const shogoMoved = oldShogo !== newShogo;
      const verificationCleared = row.verified && changesVerificationContent;
      if ((shogoMoved || verificationCleared) && (oldShogo || newShogo)) {
        await this.recomputeShogo(row.userId, tx);
      }

      return this.toApi(updated);
    });
  }

  async delete(id: string, actor: AuthenticatedUser): Promise<void> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows are immutable through this API.' } });
      }
      if (!this.auth.canDelete(actor, row)) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot delete this row.' } });
      }
      await this.repo.delete(id, tx);
      if (row.verified && row.shogoTitle) {
        await this.recomputeShogo(row.userId, tx);
      }
    });
  }

  async verify(id: string, actor: AuthenticatedUser): Promise<RankHistory> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows are implicitly verified.' } });
      }
      if (row.verified) {
        throw new ConflictException({ error: { code: 'ALREADY_VERIFIED', message: 'Row is already verified.' } });
      }
      if (row.recordedByUserId === actor.id) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Recorder cannot verify their own row.' } });
      }
      const allowed = await this.auth.canVerify(actor, row, tx);
      if (!allowed) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Not permitted to verify this row.' } });
      }

      const now = new Date();
      const updated = await this.repo.update(
        id,
        {
          verified: true,
          verifiedByUserId: actor.id,
          verifiedAt: now,
          updatedAt: now,
          updatedByUserId: actor.id,
        },
        tx,
      );
      if (!updated) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }

      if (row.shogoTitle) {
        await this.recomputeShogo(row.userId, tx);
      }
      return this.toApi(updated);
    });
  }

  async unverify(id: string, actor: AuthenticatedUser): Promise<RankHistory> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows cannot be unverified through this API.' } });
      }
      if (!row.verified) {
        throw new ConflictException({ error: { code: 'ALREADY_UNVERIFIED', message: 'Row is not currently verified.' } });
      }
      if (row.recordedByUserId === actor.id) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Recorder cannot unverify their own row.' } });
      }
      const allowed = await this.auth.canVerify(actor, row, tx);
      if (!allowed) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Not permitted to unverify this row.' } });
      }

      const now = new Date();
      const updated = await this.repo.update(
        id,
        {
          verified: false,
          verifiedByUserId: null,
          verifiedAt: null,
          updatedAt: now,
          updatedByUserId: actor.id,
        },
        tx,
      );
      if (!updated) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }

      if (row.shogoTitle) {
        await this.recomputeShogo(row.userId, tx);
      }
      return this.toApi(updated);
    });
  }

  private async recomputeShogo(userId: string, tx: DrizzleExecutor): Promise<void> {
    const top = await this.repo.findHighestVerifiedShogo(userId, tx);
    const shogoCode = top && typeof top === 'object' && 'code' in top ? top.code : null;
    await tx
      .update(userProfile)
      .set({ shogoTitle: shogoCode, updatedAt: new Date() })
      .where(eq(userProfile.userId, userId));
  }

  /** Copy only present keys (`exactOptionalPropertyTypes`-safe). */
  private buildWritePatch(input: UpdateRankHistoryInput): RankHistoryWritePatch {
    const patch: RankHistoryWritePatch = {};
    if ('rankId' in input) patch.rankId = input.rankId!;
    if ('shogoTitle' in input) patch.shogoTitle = input.shogoTitle ?? null;
    if ('date' in input) patch.date = input.date!;
    if ('examinerName' in input) patch.examinerName = input.examinerName ?? null;
    if ('organisationName' in input) patch.organisationName = input.organisationName ?? null;
    if ('notes' in input) patch.notes = input.notes ?? null;
    return patch;
  }

  private toApi(row: DbRankHistory): RankHistory {
    return {
      id: row.id,
      userId: row.userId,
      rankId: row.rankId,
      shogoTitle: row.shogoTitle,
      date: row.date,
      result: row.result,
      source: row.source,
      eventId: row.eventId,
      recordedByUserId: row.recordedByUserId,
      examinerName: row.examinerName,
      organisationName: row.organisationName,
      notes: row.notes,
      verified: row.verified,
      verifiedByUserId: row.verifiedByUserId,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      updatedByUserId: row.updatedByUserId,
    };
  }
}
