import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  OrganisationStats,
  PlatformStats,
  RebuildStatsResponse,
  StatsTrendResponse,
  UserStats,
} from '@repo/contracts/statistics';

import { CHECK_ABILITY_KEY } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { StatisticsAdminController, StatisticsController } from './statistics.controller.js';
import { StatisticsService } from './statistics.service.js';

/**
 * Pins the routing layer: six handlers across two controllers, each
 * forwarding its params + the authenticated caller to `StatisticsService`
 * unchanged and returning the service's response unchanged. All
 * authorisation logic (sysadmin-only, per-instance CASL checks, ancestor
 * rollups) lives in the service — see `statistics.service.spec.ts` — so
 * this spec never asserts on 403/404 behaviour, only on argument
 * forwarding and on the `@CheckAbility` metadata attached to each handler.
 */

const caller: AuthenticatedUser = {
  id: 'u-1',
  email: 'u@example.com',
  emailVerified: true,
  name: 'Caller',
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

function serviceStub() {
  return {
    getPlatformStats: vi.fn(),
    getOrganisationStats: vi.fn(),
    getOrganisationTrends: vi.fn(),
    getUserStats: vi.fn(),
    getUserTrends: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as Record<keyof StatisticsService, ReturnType<typeof vi.fn>>;
}

async function makeControllers(service: ReturnType<typeof serviceStub>) {
  const module = await Test.createTestingModule({
    controllers: [StatisticsController, StatisticsAdminController],
    providers: [{ provide: StatisticsService, useValue: service }],
  }).compile();
  return {
    readController: module.get(StatisticsController),
    adminController: module.get(StatisticsAdminController),
  };
}

describe('StatisticsController / StatisticsAdminController', () => {
  let service: ReturnType<typeof serviceStub>;
  let readController: StatisticsController;
  let adminController: StatisticsAdminController;

  beforeEach(async () => {
    service = serviceStub();
    ({ readController, adminController } = await makeControllers(service));
  });

  // ── Routing / argument forwarding ────────────────────────────────────────

  it('getPlatform forwards the caller to service.getPlatformStats and returns its response unchanged', async () => {
    const platformStats: PlatformStats = {
      scope: { type: 'platform' },
      metrics: {
        membershipCount: { student: 0, instructor: 0, orgadmin: 0 },
        gradingEventsMonthToDate: 0,
        activeUsersLast30Days: 0,
        feedbackThreadsOpenedMonthToDate: 0,
      },
      ranks: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    service.getPlatformStats.mockResolvedValue(platformStats);

    const out = await readController.getPlatform(caller);

    expect(service.getPlatformStats).toHaveBeenCalledWith(caller);
    expect(out).toBe(platformStats);
  });

  it('getOrganisation forwards id + caller to service.getOrganisationStats and returns its response unchanged', async () => {
    const orgStats: OrganisationStats = {
      scope: { type: 'organisation', id: 'org-1', name: 'Org One' },
      metrics: {
        membershipCount: { student: 1, instructor: 0, orgadmin: 0 },
        gradingEventsMonthToDate: 0,
        activeUsersLast30Days: 0,
        feedbackThreadsOpenedMonthToDate: 0,
      },
      ranks: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    service.getOrganisationStats.mockResolvedValue(orgStats);

    const out = await readController.getOrganisation('org-1', caller);

    expect(service.getOrganisationStats).toHaveBeenCalledWith('org-1', caller);
    expect(out).toBe(orgStats);
  });

  it('getOrganisationTrends forwards id + parsed query fields + caller to service.getOrganisationTrends', async () => {
    const trend: StatsTrendResponse = {
      metric: 'membership_count',
      dimensionKey: 'student',
      points: [{ year: 2026, month: 1, value: 3 }],
    };
    service.getOrganisationTrends.mockResolvedValue(trend);

    const out = await readController.getOrganisationTrends(
      'org-1',
      { metric: 'membership_count', dimensionKey: 'student', months: 6 },
      caller,
    );

    expect(service.getOrganisationTrends).toHaveBeenCalledWith(
      'org-1',
      'membership_count',
      'student',
      6,
      caller,
    );
    expect(out).toBe(trend);
  });

  it('getUser forwards id + caller to service.getUserStats and returns its response unchanged', async () => {
    const userStats: UserStats = {
      scope: { type: 'user', id: 'user-1', name: 'Some User' },
      coverageByRank: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    service.getUserStats.mockResolvedValue(userStats);

    const out = await readController.getUser('user-1', caller);

    expect(service.getUserStats).toHaveBeenCalledWith('user-1', caller);
    expect(out).toBe(userStats);
  });

  it('getUserTrends forwards id + parsed query fields + caller to service.getUserTrends', async () => {
    const trend: StatsTrendResponse = {
      metric: 'content_coverage_pct',
      dimensionKey: 'rank-1',
      points: [],
    };
    service.getUserTrends.mockResolvedValue(trend);

    const out = await readController.getUserTrends(
      'user-1',
      { metric: 'content_coverage_pct', dimensionKey: 'rank-1', months: 12 },
      caller,
    );

    expect(service.getUserTrends).toHaveBeenCalledWith(
      'user-1',
      'content_coverage_pct',
      'rank-1',
      12,
      caller,
    );
    expect(out).toBe(trend);
  });

  it('rebuild forwards the caller to service.rebuild and returns its response unchanged', async () => {
    const rebuildResponse: RebuildStatsResponse = { ok: true, durationMs: 42 };
    service.rebuild.mockResolvedValue(rebuildResponse);

    const out = await adminController.rebuild(caller);

    expect(service.rebuild).toHaveBeenCalledWith(caller);
    expect(out).toBe(rebuildResponse);
  });

  it('propagates errors from the service untransformed', async () => {
    const error = new Error('boom');
    service.getPlatformStats.mockRejectedValue(error);
    await expect(readController.getPlatform(caller)).rejects.toBe(error);
  });

  // ── Authorisation metadata ───────────────────────────────────────────────

  it('all five read handlers carry @CheckAbility(read, Statistics)', () => {
    for (const handler of [
      StatisticsController.prototype.getPlatform,
      StatisticsController.prototype.getOrganisation,
      StatisticsController.prototype.getOrganisationTrends,
      StatisticsController.prototype.getUser,
      StatisticsController.prototype.getUserTrends,
    ]) {
      expect(Reflect.getMetadata(CHECK_ABILITY_KEY, handler)).toEqual([
        { action: 'read', subject: 'Statistics' },
      ]);
    }
  });

  it('rebuild carries @CheckAbility(manage, Statistics)', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, StatisticsAdminController.prototype.rebuild),
    ).toEqual([{ action: 'manage', subject: 'Statistics' }]);
  });
});
