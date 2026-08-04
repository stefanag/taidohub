import { describe, expect, it } from 'vitest';

import {
  OrganisationStatsSchema,
  PlatformStatsSchema,
  RebuildStatsResponseSchema,
  StatsTrendPointSchema,
  StatsTrendQuerySchema,
  UserStatsSchema,
} from '../statistics.js';

const RANK = { id: '00000000-0000-4000-8000-000000000001', nameRomaji: 'shodan', nameEn: 'Shodan', sortOrder: 10 };
const OK_ORG = {
  scope: { type: 'organisation', id: '00000000-0000-4000-8000-000000000010', name: 'Stockholm Club' },
  metrics: {
    membershipCount: { student: 42, instructor: 3, orgadmin: 1 },
    gradingEventsMonthToDate: 5,
    activeUsersLast30Days: 28,
    feedbackThreadsOpenedMonthToDate: 12,
  },
  ranks: [{ rank: RANK, count: 12 }],
  updatedAt: '2026-07-31T12:00:00.000Z',
};

describe('OrganisationStatsSchema', () => {
  it('accepts a fully populated response', () => {
    expect(OrganisationStatsSchema.safeParse(OK_ORG).success).toBe(true);
  });
  it('accepts an empty ranks array (fresh org with no members yet)', () => {
    expect(OrganisationStatsSchema.safeParse({ ...OK_ORG, ranks: [] }).success).toBe(true);
  });
  it('rejects a negative count', () => {
    const bad = { ...OK_ORG, ranks: [{ rank: RANK, count: -1 }] };
    expect(OrganisationStatsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('PlatformStatsSchema', () => {
  it('accepts the platform scope shape', () => {
    const ok = { ...OK_ORG, scope: { type: 'platform' } };
    expect(PlatformStatsSchema.safeParse(ok).success).toBe(true);
  });
});

describe('UserStatsSchema', () => {
  it('accepts a user scope + coverage per rank', () => {
    expect(
      UserStatsSchema.safeParse({
        scope: { type: 'user', id: 'u-1', name: 'Ada Lovelace' },
        coverageByRank: [{ rank: RANK, coveragePct: 42.5 }],
        updatedAt: '2026-07-31T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
  it('rejects coveragePct > 100', () => {
    expect(
      UserStatsSchema.safeParse({
        scope: { type: 'user', id: 'u-1', name: null },
        coverageByRank: [{ rank: RANK, coveragePct: 101 }],
        updatedAt: '2026-07-31T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('StatsTrendQuerySchema', () => {
  it('coerces string months to number and defaults to 12', () => {
    const parsed = StatsTrendQuerySchema.parse({ metric: 'membershipCount' });
    expect(parsed.months).toBe(12);
  });
  it('coerces "24" to 24', () => {
    const parsed = StatsTrendQuerySchema.parse({ metric: 'x', months: '24' });
    expect(parsed.months).toBe(24);
  });
  it('rejects months > 60', () => {
    expect(StatsTrendQuerySchema.safeParse({ metric: 'x', months: 61 }).success).toBe(false);
  });
});

describe('StatsTrendPointSchema', () => {
  it('rejects month=13', () => {
    expect(StatsTrendPointSchema.safeParse({ year: 2026, month: 13, value: 1 }).success).toBe(false);
  });
});

describe('RebuildStatsResponseSchema', () => {
  it('accepts the ok/durationMs shape', () => {
    expect(RebuildStatsResponseSchema.safeParse({ ok: true, durationMs: 1234 }).success).toBe(true);
  });
});
