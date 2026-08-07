import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbOrganisation, type DbUser } from '../../infrastructure/database/schema/index.js';
import { type BeltRanksService } from '../belt-catalog/belt-ranks.service.js';
import { type MembershipsRepository } from '../memberships/memberships.repository.js';
import { type OrganisationsRepository } from '../organisations/organisations.repository.js';
import { type UsersRepository } from '../users/users.repository.js';

import { type StatisticsRepository, type OrgOrPlatformStatsRaw, type UserStatsRaw } from './statistics.repository.js';
import { StatisticsService } from './statistics.service.js';

import type { BeltRank } from '@repo/contracts/ranks';

// ── Shared fixtures ────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u@example.com',
    emailVerified: true,
    name: 'Caller',
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

function dbUser(overrides: Partial<DbUser> = {}): DbUser {
  return {
    id: 'u-1',
    email: 'u@example.com',
    emailVerified: true,
    name: 'Some User',
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as DbUser;
}

function dbOrg(overrides: Partial<DbOrganisation> = {}): DbOrganisation {
  return {
    id: 'org-x',
    parentId: null,
    type: 'club',
    shortCode: 'X',
    slug: null,
    country: null,
    nameEn: 'Org X',
    nameSv: 'Org X sv',
    nameFi: 'Org X fi',
    nameJa: null,
    logoUrl: null,
    address: null,
    contactEmail: null,
    headInstructorId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as DbOrganisation;
}

function beltRank(overrides: Partial<BeltRank> = {}): BeltRank {
  return {
    id: 'rank-1',
    organisationId: null,
    systemId: 'sys-1',
    level: 1,
    sortOrder: 10,
    nameJa: null,
    nameRomaji: 'Jukyu',
    nameEn: '9th Kyu',
    nameSv: '9:e Kyu',
    nameFi: '9. Kyu',
    beltColor: '#ffffff',
    visuals: null,
    imageUrl: null,
    descriptionEn: null,
    descriptionSv: null,
    descriptionFi: null,
    publiclyVisible: false,
    slug: null,
    minAge: null,
    nextRankId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as BeltRank;
}

function orgOrPlatformRaw(overrides: Partial<OrgOrPlatformStatsRaw> = {}): OrgOrPlatformStatsRaw {
  return {
    metrics: {
      membershipCount: { student: 0, instructor: 0, orgadmin: 0 },
      gradingEventsMonthToDate: 0,
      activeUsersLast30Days: 0,
      feedbackThreadsOpenedMonthToDate: 0,
    },
    ranks: [],
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function userStatsRaw(overrides: Partial<UserStatsRaw> = {}): UserStatsRaw {
  return {
    coverageByRank: [],
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Harness ──────────────────────────────────────────────────────────────

interface Harness {
  service: StatisticsService;
  repo: { [K in keyof StatisticsRepository]: ReturnType<typeof vi.fn> };
  orgs: { findById: ReturnType<typeof vi.fn>; getAncestorIds: ReturnType<typeof vi.fn> };
  ranks: { list: ReturnType<typeof vi.fn> };
  abilities: { createForUser: ReturnType<typeof vi.fn> };
  users: { findById: ReturnType<typeof vi.fn> };
  memberships: { list: ReturnType<typeof vi.fn> };
  fakeAbility: { can: ReturnType<typeof vi.fn> };
}

function build(opts: { can?: boolean } = {}): Harness {
  const { can = false } = opts;

  const repo = {
    getPlatform: vi.fn(),
    getOrganisation: vi.fn(),
    getUser: vi.fn(),
    getTrends: vi.fn(),
    rebuildAll: vi.fn(),
    refreshActivityStats: vi.fn(),
    recomputeAvgGapPerRank: vi.fn(),
    captureMonthlyIfNewMonth: vi.fn(),
  };

  const orgs = {
    findById: vi.fn().mockResolvedValue(dbOrg()),
    getAncestorIds: vi.fn().mockResolvedValue([]),
  };

  const ranks = {
    list: vi.fn().mockResolvedValue([]),
  };

  const fakeAbility = { can: vi.fn().mockReturnValue(can) };
  const abilities = {
    createForUser: vi.fn().mockReturnValue(fakeAbility),
  };

  const users = {
    findById: vi.fn().mockResolvedValue(dbUser()),
  };

  const memberships = {
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const service = new StatisticsService(
    repo as unknown as StatisticsRepository,
    orgs as unknown as OrganisationsRepository,
    ranks as unknown as BeltRanksService,
    abilities as unknown as AbilityFactory,
    users as unknown as UsersRepository,
    memberships as unknown as MembershipsRepository,
  );

  return { service, repo, orgs, ranks, abilities, users, memberships, fakeAbility };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('StatisticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlatformStats', () => {
    it('sysadmin gets the mapped wire shape', async () => {
      const { service, repo } = build();
      repo.getPlatform.mockResolvedValue(orgOrPlatformRaw());

      const result = await service.getPlatformStats(makeUser({ role: 'sysadmin' }));

      expect(result).toEqual({
        scope: { type: 'platform' },
        metrics: orgOrPlatformRaw().metrics,
        ranks: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('non-sysadmin is forbidden', async () => {
      const { service } = build();
      await expect(service.getPlatformStats(makeUser({ role: 'user' }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('getOrganisationStats', () => {
    it('sysadmin gets the wire shape', async () => {
      const { service, repo, orgs } = build();
      repo.getOrganisation.mockResolvedValue(orgOrPlatformRaw());
      orgs.findById.mockResolvedValue(dbOrg({ id: 'org-x', nameEn: 'Org X' }));

      const result = await service.getOrganisationStats('org-x', makeUser({ role: 'sysadmin' }));

      expect(result.scope).toEqual({ type: 'organisation', id: 'org-x', name: 'Org X' });
    });

    it('orgadmin of that org gets the wire shape', async () => {
      const { service, repo, fakeAbility } = build();
      fakeAbility.can.mockReturnValue(true);
      repo.getOrganisation.mockResolvedValue(orgOrPlatformRaw());

      const caller = makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] });
      const result = await service.getOrganisationStats('org-x', caller);

      expect(result.scope.type).toBe('organisation');
    });

    it('an unrelated user is forbidden', async () => {
      const { service, fakeAbility } = build();
      fakeAbility.can.mockReturnValue(false);

      const caller = makeUser({ memberships: [{ organisationId: 'org-other', role: 'student' }] });
      await expect(service.getOrganisationStats('org-x', caller)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('an unknown org (repo.getOrganisation returns null) is a NotFoundException', async () => {
      const { service, repo } = build();
      repo.getOrganisation.mockResolvedValue(null);

      await expect(
        service.getOrganisationStats('org-missing', makeUser({ role: 'sysadmin' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ancestor rollup: orgadmin of a descendant org X can read ancestor org Y', async () => {
      const { service, repo, orgs, fakeAbility } = build();
      // Flat CASL check fails (Y is not the orgadmin's own org)...
      fakeAbility.can.mockReturnValue(false);
      // ...but Y is in X's ancestor chain.
      orgs.getAncestorIds.mockResolvedValue(['org-x', 'org-y']);
      repo.getOrganisation.mockResolvedValue(orgOrPlatformRaw());

      const caller = makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] });
      const result = await service.getOrganisationStats('org-y', caller);

      expect(orgs.getAncestorIds).toHaveBeenCalledWith('org-x');
      expect(result.scope.type).toBe('organisation');
    });

    it('ancestor rollup does not leak an unrelated org Z', async () => {
      const { service, orgs, fakeAbility } = build();
      fakeAbility.can.mockReturnValue(false);
      orgs.getAncestorIds.mockResolvedValue(['org-x', 'org-y']);

      const caller = makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] });
      await expect(service.getOrganisationStats('org-z', caller)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('getOrganisationTrends', () => {
    it('sysadmin gets the trend response', async () => {
      const { service, repo } = build();
      repo.getTrends.mockResolvedValue([{ year: 2026, month: 1, value: 5 }]);

      const result = await service.getOrganisationTrends(
        'org-x',
        'membership_count',
        'student',
        12,
        makeUser({ role: 'sysadmin' }),
      );

      expect(repo.getTrends).toHaveBeenCalledWith(
        { type: 'organisation', id: 'org-x' },
        'membership_count',
        'student',
        12,
      );
      expect(result).toEqual({
        metric: 'membership_count',
        dimensionKey: 'student',
        points: [{ year: 2026, month: 1, value: 5 }],
      });
    });

    it('an unrelated user is forbidden', async () => {
      const { service, fakeAbility } = build();
      fakeAbility.can.mockReturnValue(false);

      await expect(
        service.getOrganisationTrends('org-x', 'membership_count', 'student', 12, makeUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getUserStats', () => {
    it('self can read their own stats', async () => {
      const { service, repo, users } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'u-1', name: 'Alice' }));
      repo.getUser.mockResolvedValue(userStatsRaw());

      const caller = makeUser({ id: 'u-1' });
      const result = await service.getUserStats('u-1', caller);

      expect(result.scope).toEqual({ type: 'user', id: 'u-1', name: 'Alice' });
    });

    it('an instructor of a shared org can read the student\'s stats', async () => {
      const { service, repo, users, memberships, fakeAbility } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'student-1', name: 'Student One' }));
      memberships.list.mockResolvedValue({
        data: [{ id: 'm-1', userId: 'student-1', organisationId: 'org-x', role: 'student' }],
        total: 1,
      });
      fakeAbility.can.mockReturnValue(true);
      repo.getUser.mockResolvedValue(userStatsRaw());

      const caller = makeUser({ id: 'u-2', memberships: [{ organisationId: 'org-x', role: 'instructor' }] });
      const result = await service.getUserStats('student-1', caller);

      expect(memberships.list).toHaveBeenCalledWith({ userId: 'student-1' });
      expect(result.scope.id).toBe('student-1');
    });

    it('an orgadmin of a shared org can read the student\'s stats even without an instructor membership', async () => {
      const { service, repo, users, memberships, fakeAbility } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'student-1', name: 'Student One' }));
      memberships.list.mockResolvedValue({
        data: [{ id: 'm-1', userId: 'student-1', organisationId: 'org-x', role: 'student' }],
        total: 1,
      });
      fakeAbility.can.mockReturnValue(true);
      repo.getUser.mockResolvedValue(userStatsRaw());

      const caller = makeUser({ id: 'u-2', memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] });
      const result = await service.getUserStats('student-1', caller);

      expect(result.scope.id).toBe('student-1');
    });

    it('an unrelated caller is forbidden', async () => {
      const { service, users, memberships, fakeAbility } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'student-1' }));
      memberships.list.mockResolvedValue({
        data: [{ id: 'm-1', userId: 'student-1', organisationId: 'org-x', role: 'student' }],
        total: 1,
      });
      fakeAbility.can.mockReturnValue(false);

      const caller = makeUser({ id: 'u-2', memberships: [] });
      await expect(service.getUserStats('student-1', caller)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a missing target user is a NotFoundException', async () => {
      const { service, users } = build();
      users.findById.mockResolvedValue(null);

      await expect(service.getUserStats('ghost', makeUser({ role: 'sysadmin' }))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ancestor rollup: an orgadmin of an ancestor org can read a student in a descendant club (subtree)', async () => {
      const { service, repo, users, memberships, orgs, fakeAbility } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'student-1', name: 'Student One' }));
      memberships.list.mockResolvedValue({
        data: [{ id: 'm-1', userId: 'student-1', organisationId: 'org-club', role: 'student' }],
        total: 1,
      });
      // Flat CASL check fails (org-club isn't the caller's own org)...
      fakeAbility.can.mockReturnValue(false);
      // ...but org-federation is an ancestor of org-club.
      orgs.getAncestorIds.mockResolvedValue(['org-club', 'org-federation']);
      repo.getUser.mockResolvedValue(userStatsRaw());

      const caller = makeUser({
        id: 'u-2',
        memberships: [{ organisationId: 'org-federation', role: 'orgadmin' }],
      });
      const result = await service.getUserStats('student-1', caller);

      expect(orgs.getAncestorIds).toHaveBeenCalledWith('org-club');
      expect(result.scope.id).toBe('student-1');
    });

    it('throws 403 before 404 when caller is unauthorized AND user does not exist', async () => {
      const { service, users, memberships, fakeAbility } = build();
      users.findById.mockResolvedValue(null); // user does not exist
      memberships.list.mockResolvedValue({ data: [], total: 0 });
      fakeAbility.can.mockReturnValue(false);

      const caller = makeUser({ id: 'u-2', memberships: [] }); // non-sysadmin, no relevant memberships

      await expect(service.getUserStats('missing-id', caller)).rejects.toThrow(ForbiddenException);
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('regression: Date(0) sentinel from an empty coverage becomes "now", not 1970', async () => {
      const { service, repo, users } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'u-1' }));
      repo.getUser.mockResolvedValue(userStatsRaw({ coverageByRank: [], updatedAt: new Date(0) }));

      const before = Date.now();
      const result = await service.getUserStats('u-1', makeUser({ id: 'u-1' }));
      const after = Date.now();

      const updatedAtMs = new Date(result.updatedAt).getTime();
      expect(updatedAtMs).toBeGreaterThanOrEqual(before);
      expect(updatedAtMs).toBeLessThanOrEqual(after);
    });
  });

  describe('getUserTrends', () => {
    it('self gets the trend response', async () => {
      const { service, repo, users } = build();
      users.findById.mockResolvedValue(dbUser({ id: 'u-1' }));
      repo.getTrends.mockResolvedValue([{ year: 2026, month: 2, value: 42 }]);

      const result = await service.getUserTrends(
        'u-1',
        'content_coverage_pct',
        'rank-1',
        6,
        makeUser({ id: 'u-1' }),
      );

      expect(repo.getTrends).toHaveBeenCalledWith(
        { type: 'user', id: 'u-1' },
        'content_coverage_pct',
        'rank-1',
        6,
      );
      expect(result.points).toEqual([{ year: 2026, month: 2, value: 42 }]);
    });
  });

  describe('rebuild', () => {
    it('sysadmin gets { ok, durationMs }', async () => {
      const { service, repo } = build();
      repo.rebuildAll.mockResolvedValue({ durationMs: 123 });

      const result = await service.rebuild(makeUser({ role: 'sysadmin' }));

      expect(result).toEqual({ ok: true, durationMs: 123 });
    });

    it('a non-sysadmin is forbidden', async () => {
      const { service } = build();
      await expect(service.rebuild(makeUser({ role: 'user' }))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('toOrgApi mapper (via getOrganisationStats)', () => {
    it('backfills catalog ranks the repo did not return with count 0, sorted by sortOrder', async () => {
      const { service, repo, orgs, fakeAbility, ranks } = build();
      fakeAbility.can.mockReturnValue(true);
      orgs.findById.mockResolvedValue(dbOrg({ id: 'org-x', nameEn: 'Org X' }));
      repo.getOrganisation.mockResolvedValue(
        orgOrPlatformRaw({
          ranks: [
            { rankId: 'rank-b', count: 4 },
            { rankId: 'rank-c', count: 1 },
          ],
        }),
      );
      ranks.list.mockResolvedValue([
        beltRank({ id: 'rank-a', sortOrder: 10, nameRomaji: 'A', nameEn: 'A' }),
        beltRank({ id: 'rank-b', sortOrder: 20, nameRomaji: 'B', nameEn: 'B' }),
        beltRank({ id: 'rank-c', sortOrder: 30, nameRomaji: 'C', nameEn: 'C' }),
      ]);

      const caller = makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] });
      const result = await service.getOrganisationStats('org-x', caller);

      expect(result.ranks).toHaveLength(3);
      expect(result.ranks.map((r) => r.rank.id)).toEqual(['rank-a', 'rank-b', 'rank-c']);
      expect(result.ranks.map((r) => r.count)).toEqual([0, 4, 1]);
    });

    it('silently skips a raw rank_count row for a rank id not in the belt catalog', async () => {
      const { service, repo, orgs, fakeAbility, ranks } = build();
      fakeAbility.can.mockReturnValue(true);
      orgs.findById.mockResolvedValue(dbOrg({ id: 'org-x', nameEn: 'Org X' }));
      repo.getOrganisation.mockResolvedValue(
        orgOrPlatformRaw({ ranks: [{ rankId: 'deleted-rank', count: 9 }] }),
      );
      ranks.list.mockResolvedValue([beltRank({ id: 'rank-a', sortOrder: 10 })]);

      const caller = makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] });
      const result = await service.getOrganisationStats('org-x', caller);

      expect(result.ranks).toEqual([
        { rank: { id: 'rank-a', nameRomaji: 'Jukyu', nameEn: '9th Kyu', sortOrder: 10 }, count: 0 },
      ]);
    });
  });
});
