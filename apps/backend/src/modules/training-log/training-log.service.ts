import { ForbiddenError } from '@casl/ability';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type ListTrainingSessionsQuery,
  type SaveTrainingSessionInput,
  type TrainingGoal,
  type TrainingSession,
} from '@repo/contracts/training-log';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { BeltRanksService } from '../belt-catalog/belt-ranks.service.js';
import { ProgressService } from '../progress/progress.service.js';

import { TrainingLogRepository, type TrainingSessionRow } from './training-log.repository.js';

/**
 * The signed-in user's training log and personal goals. Saving a session moves
 * "last practised" up on the practised techniques and patterns, in the same
 * transaction, through ProgressService.
 */
@Injectable()
export class TrainingLogService {
  constructor(
    private readonly repo: TrainingLogRepository,
    private readonly progress: ProgressService,
    private readonly ranks: BeltRanksService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListTrainingSessionsQuery,
  ): Promise<TrainingSession[]> {
    const rows = await this.repo.listByUser(actor.id, query);
    return rows.map(toApi);
  }

  async create(
    actor: AuthenticatedUser,
    input: SaveTrainingSessionInput,
  ): Promise<TrainingSession> {
    const items = dedupe(input.items);
    const id = await this.repo.transaction(async (tx) => {
      const sessionId = await this.repo.insert(actor.id, fields(input), items, tx);
      await this.progress.markPracticed(actor.id, items, input.date, tx);
      return sessionId;
    });
    return toApi((await this.repo.findById(id))!);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: SaveTrainingSessionInput,
  ): Promise<TrainingSession> {
    await this.findOwn(actor, id, 'update');
    const items = dedupe(input.items);
    await this.repo.transaction(async (tx) => {
      await this.repo.replace(id, fields(input), items, tx);
      await this.progress.markPracticed(actor.id, items, input.date, tx);
    });
    return toApi((await this.repo.findById(id))!);
  }

  /** Deleting a session leaves "last practised" as it is: it is a high-water mark. */
  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.findOwn(actor, id, 'delete');
    await this.repo.delete(id);
  }

  async getGoal(actor: AuthenticatedUser): Promise<TrainingGoal> {
    const row = await this.repo.findGoal(actor.id);
    return {
      targetRankId: row?.targetRankId ?? null,
      targetDate: row?.targetDate ?? null,
      sessionsPerWeek: row?.sessionsPerWeek ?? null,
    };
  }

  async setGoal(actor: AuthenticatedUser, input: TrainingGoal): Promise<TrainingGoal> {
    if (input.targetRankId) await this.ranks.findByKey(input.targetRankId);
    const row = await this.repo.upsertGoal(actor.id, input);
    return {
      targetRankId: row.targetRankId,
      targetDate: row.targetDate,
      sessionsPerWeek: row.sessionsPerWeek,
    };
  }

  private async findOwn(
    actor: AuthenticatedUser,
    id: string,
    action: 'update' | 'delete',
  ): Promise<TrainingSessionRow> {
    const row = await this.repo.findById(id);
    // Someone else's session answers like a missing one: its existence is private too.
    if (!row || row.userId !== actor.id) throw new NotFoundException('Training session not found.');
    const ability = this.abilityFactory.createForUser(actor);
    ForbiddenError.from(ability).throwUnlessCan(action, {
      __caslSubjectType__: 'TrainingSession',
      userId: row.userId,
    });
    return row;
  }
}

function fields(input: SaveTrainingSessionInput) {
  return {
    date: input.date,
    durationMinutes: input.durationMinutes ?? null,
    kind: input.kind,
    notes: input.notes ? input.notes : null,
  };
}

function dedupe(items: SaveTrainingSessionInput['items']): SaveTrainingSessionInput['items'] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.contentType}:${item.contentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toApi(row: TrainingSessionRow): TrainingSession {
  return {
    id: row.id,
    date: row.date,
    durationMinutes: row.durationMinutes,
    kind: row.kind,
    notes: row.notes,
    items: row.items.map((i) => ({ contentType: i.contentType, contentId: i.contentId })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
