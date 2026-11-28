import { ForbiddenError } from '@casl/ability';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ClubJoinRequest,
  type CreateClubJoinRequestInput,
  type JoinableClub,
} from '@repo/contracts/club-join-requests';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { OrganisationsService } from '../organisations/organisations.service.js';
import { RankHistoryService } from '../rank-history/rank-history.service.js';

import {
  ClubJoinRequestsRepository,
  type ClubJoinRequestRow,
} from './club-join-requests.repository.js';

/**
 * Users without a club ask to join one; the club's orgadmin or instructor
 * approves (creating a student membership) or declines. The club sees name,
 * e-mail, current rank and the message; after approval the existing
 * membership rules give it the grading history to verify.
 */
@Injectable()
export class ClubJoinRequestsService {
  constructor(
    private readonly repo: ClubJoinRequestsRepository,
    private readonly organisations: OrganisationsService,
    private readonly memberships: MembershipsService,
    private readonly rankHistory: RankHistoryService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async clubs(): Promise<JoinableClub[]> {
    const rows = await this.organisations.listClubs();
    return rows.map((o) => ({
      id: o.id,
      shortCode: o.shortCode,
      nameEn: o.nameEn,
      nameSv: o.nameSv,
      nameFi: o.nameFi,
      country: o.country,
    }));
  }

  async mine(actor: AuthenticatedUser): Promise<ClubJoinRequest[]> {
    return Promise.all((await this.repo.listByUser(actor.id)).map((r) => this.toApi(r)));
  }

  /** Pending requests to the clubs the caller may decide for (every club for sysadmin). */
  async pending(actor: AuthenticatedUser): Promise<ClubJoinRequest[]> {
    const rows =
      actor.role === 'sysadmin'
        ? await this.repo.listPending()
        : await this.repo.listPending(
            actor.memberships
              .filter((m) => m.role === 'orgadmin' || m.role === 'instructor')
              .map((m) => m.organisationId),
          );
    return Promise.all(rows.map((r) => this.toApi(r)));
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateClubJoinRequestInput,
  ): Promise<ClubJoinRequest> {
    ForbiddenError.from(this.ability(actor)).throwUnlessCan('create', {
      __caslSubjectType__: 'ClubJoinRequest',
      userId: actor.id,
      organisationId: input.organisationId,
    });
    if (actor.memberships.length > 0) {
      throw new ConflictException({
        error: {
          code: 'ALREADY_MEMBER',
          message: 'Only a user without a club can ask to join one.',
        },
      });
    }
    const org = await this.organisations.findById(input.organisationId);
    if (org?.type !== 'club') {
      throw new BadRequestException({
        error: { code: 'NOT_A_CLUB', message: 'That organisation is not a club.' },
      });
    }
    if (await this.repo.hasPending(actor.id)) {
      throw new ConflictException({
        error: {
          code: 'REQUEST_PENDING',
          message: 'You already have a pending request. Cancel it first.',
        },
      });
    }
    const id = await this.repo.insert({
      userId: actor.id,
      organisationId: input.organisationId,
      message: input.message ? input.message : null,
    });
    return this.toApi((await this.repo.findById(id))!);
  }

  async cancel(actor: AuthenticatedUser, id: string): Promise<void> {
    const row = await this.findVisible(actor, id);
    ForbiddenError.from(this.ability(actor)).throwUnlessCan('delete', this.subject(row));
    if (!(await this.repo.decide(id, 'cancelled', actor.id))) throw this.notPending();
  }

  async approve(actor: AuthenticatedUser, id: string): Promise<ClubJoinRequest> {
    const row = await this.findVisible(actor, id);
    ForbiddenError.from(this.ability(actor)).throwUnlessCan('update', this.subject(row));
    await this.repo.transaction(async (tx) => {
      if (!(await this.repo.decide(id, 'approved', actor.id, tx))) throw this.notPending();
      await this.memberships.addStudentForJoinRequest(row.userId, row.organisationId, actor, tx);
    });
    this.memberships.refreshUserCache(row.userId);
    return this.toApi((await this.repo.findById(id))!);
  }

  async decline(actor: AuthenticatedUser, id: string): Promise<ClubJoinRequest> {
    const row = await this.findVisible(actor, id);
    ForbiddenError.from(this.ability(actor)).throwUnlessCan('update', this.subject(row));
    if (!(await this.repo.decide(id, 'declined', actor.id))) throw this.notPending();
    return this.toApi((await this.repo.findById(id))!);
  }

  /** A request the caller may not read answers like a missing one. */
  private async findVisible(actor: AuthenticatedUser, id: string): Promise<ClubJoinRequestRow> {
    const row = await this.repo.findById(id);
    if (!row || !this.ability(actor).can('read', this.subject(row))) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Join request not found.' },
      });
    }
    return row;
  }

  private ability(actor: AuthenticatedUser) {
    return this.abilityFactory.createForUser(actor);
  }

  private subject(row: ClubJoinRequestRow) {
    return {
      __caslSubjectType__: 'ClubJoinRequest' as const,
      userId: row.userId,
      organisationId: row.organisationId,
    };
  }

  private notPending(): ConflictException {
    return new ConflictException({
      error: {
        code: 'NOT_PENDING',
        message: 'This request has already been decided or cancelled.',
      },
    });
  }

  private async toApi(row: ClubJoinRequestRow): Promise<ClubJoinRequest> {
    return {
      id: row.id,
      club: row.club,
      status: row.status,
      message: row.message,
      applicant: {
        userId: row.userId,
        name: row.applicantName,
        email: row.applicantEmail,
        currentRankId: await this.rankHistory.latestPassedRankId(row.userId),
      },
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    };
  }
}
