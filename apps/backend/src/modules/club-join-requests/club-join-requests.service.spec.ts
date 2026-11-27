import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type MembershipsService } from '../memberships/memberships.service.js';
import { type OrganisationsService } from '../organisations/organisations.service.js';
import { type RankHistoryService } from '../rank-history/rank-history.service.js';

import { ClubJoinRequestAbilityRules } from './club-join-requests.abilities.js';
import {
  type ClubJoinRequestRow,
  type ClubJoinRequestsRepository,
} from './club-join-requests.repository.js';
import { ClubJoinRequestsService } from './club-join-requests.service.js';

const CLUB = '11111111-1111-4111-8111-111111111111';
const TX = { __tx: true };

const user = (overrides: Partial<AuthenticatedUser> = {}) =>
  ({
    id: 'u-1',
    email: 'u@example.com',
    name: 'U',
    role: 'user',
    memberships: [],
    ...overrides,
  }) as AuthenticatedUser;
const staff = user({ id: 'staff', memberships: [{ organisationId: CLUB, role: 'instructor' }] });

function row(overrides: Partial<ClubJoinRequestRow> = {}): ClubJoinRequestRow {
  return {
    id: 'r-1',
    userId: 'u-1',
    organisationId: CLUB,
    status: 'pending',
    message: null,
    decidedById: null,
    decidedAt: null,
    createdAt: new Date('2026-11-27T10:00:00Z'),
    applicantName: 'U',
    applicantEmail: 'u@example.com',
    club: {
      id: CLUB,
      shortCode: 'C',
      nameEn: 'Club',
      nameSv: 'Klubb',
      nameFi: 'Seura',
      country: 'SE',
    },
    ...overrides,
  };
}

function build(found: ClubJoinRequestRow | null = row()) {
  const repo = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
    findById: vi.fn().mockResolvedValue(found),
    listByUser: vi.fn().mockResolvedValue([]),
    listPending: vi.fn().mockResolvedValue([]),
    hasPending: vi.fn().mockResolvedValue(false),
    insert: vi.fn().mockResolvedValue('r-1'),
    decide: vi.fn().mockResolvedValue(true),
  };
  const organisations = {
    findById: vi.fn().mockResolvedValue({ id: CLUB, type: 'club' }),
    listClubs: vi.fn(),
  };
  const memberships = {
    addStudentForJoinRequest: vi.fn().mockResolvedValue(true),
    refreshUserCache: vi.fn(),
  };
  const rankHistory = { latestPassedRankId: vi.fn().mockResolvedValue(null) };
  const abilityFactory = {
    createForUser: (u: AuthenticatedUser) => {
      const b = new AbilityBuilder<AppAbility>(createMongoAbility);
      new ClubJoinRequestAbilityRules().contributeTo(b, u);
      return b.build();
    },
  };
  const service = new ClubJoinRequestsService(
    repo as unknown as ClubJoinRequestsRepository,
    organisations as unknown as OrganisationsService,
    memberships as unknown as MembershipsService,
    rankHistory as unknown as RankHistoryService,
    abilityFactory as unknown as AbilityFactory,
  );
  return { service, repo, organisations, memberships };
}

describe('ClubJoinRequestsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a request from someone who already has a club', async () => {
    const h = build();
    await expect(
      h.service.create(user({ memberships: [{ organisationId: 'x', role: 'student' }] }), {
        organisationId: CLUB,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.repo.insert).not.toHaveBeenCalled();
  });

  it('refuses a second pending request', async () => {
    const h = build();
    h.repo.hasPending.mockResolvedValue(true);
    await expect(h.service.create(user(), { organisationId: CLUB })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('approves by adding a student membership in the same transaction', async () => {
    const h = build();
    await h.service.approve(staff, 'r-1');
    expect(h.repo.decide).toHaveBeenCalledWith('r-1', 'approved', 'staff', TX);
    expect(h.memberships.addStudentForJoinRequest).toHaveBeenCalledWith('u-1', CLUB, staff, TX);
    expect(h.memberships.refreshUserCache).toHaveBeenCalledWith('u-1');
  });

  it('adds no membership when the request was already decided', async () => {
    const h = build();
    h.repo.decide.mockResolvedValue(false);
    await expect(h.service.approve(staff, 'r-1')).rejects.toBeInstanceOf(ConflictException);
    expect(h.memberships.addStudentForJoinRequest).not.toHaveBeenCalled();
  });

  it('hides a request from someone outside the club', async () => {
    const h = build();
    const outsider = user({
      id: 'o',
      memberships: [{ organisationId: 'other', role: 'orgadmin' }],
    });
    await expect(h.service.approve(outsider, 'r-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.cancel(outsider, 'r-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists pending requests only for the clubs the caller decides for', async () => {
    const h = build();
    await h.service.pending(
      user({
        memberships: [
          { organisationId: CLUB, role: 'orgadmin' },
          { organisationId: 'x', role: 'student' },
        ],
      }),
    );
    expect(h.repo.listPending).toHaveBeenCalledWith([CLUB]);
  });
});
