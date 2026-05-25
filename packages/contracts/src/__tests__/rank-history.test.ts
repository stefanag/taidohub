import { describe, expect, it } from 'vitest';

import {
  CreateRankHistorySchema,
  GradingHistoryResponseSchema,
  GradingHistoryRowSchema,
  RankHistorySchema,
  UpdateRankHistorySchema,
} from '../rank-history.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-24T08:00:00.000Z';

describe('CreateRankHistorySchema', () => {
  it('accepts a minimal external entry', () => {
    expect(
      CreateRankHistorySchema.safeParse({
        rankId: UUID,
        date: '2024-09-01',
      }).success,
    ).toBe(true);
  });

  it('accepts a full external entry', () => {
    expect(
      CreateRankHistorySchema.safeParse({
        rankId: UUID,
        shogoTitle: 'kyoshi',
        date: '2024-09-01',
        examinerName: 'Sensei Tanaka',
        organisationName: 'Kobe Dojo',
        notes: 'Strong performance on kata.',
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      CreateRankHistorySchema.safeParse({ rankId: UUID, date: '2024-13-99' }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid rankId', () => {
    expect(
      CreateRankHistorySchema.safeParse({ rankId: 'nope', date: '2024-09-01' }).success,
    ).toBe(false);
  });

  it('rejects notes longer than 5000 chars', () => {
    expect(
      CreateRankHistorySchema.safeParse({
        rankId: UUID,
        date: '2024-09-01',
        notes: 'x'.repeat(5001),
      }).success,
    ).toBe(false);
  });
});

describe('UpdateRankHistorySchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateRankHistorySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a notes-only patch', () => {
    expect(UpdateRankHistorySchema.safeParse({ notes: 'updated' }).success).toBe(true);
  });

  it('accepts an explicit null on a nullable field', () => {
    expect(UpdateRankHistorySchema.safeParse({ shogoTitle: null }).success).toBe(true);
  });
});

describe('RankHistorySchema', () => {
  it('accepts a full read row', () => {
    expect(
      RankHistorySchema.safeParse({
        id: UUID,
        userId: 'u-1',
        rankId: UUID,
        shogoTitle: null,
        date: '2024-09-01',
        result: 'pass',
        source: 'external',
        eventId: null,
        recordedByUserId: 'u-1',
        examinerName: null,
        organisationName: null,
        notes: null,
        verified: false,
        verifiedByUserId: null,
        verifiedAt: null,
        createdAt: ISO,
        updatedAt: null,
        updatedByUserId: null,
      }).success,
    ).toBe(true);
  });
});

describe('GradingHistoryRowSchema', () => {
  it('accepts a fully-hydrated projection row', () => {
    expect(
      GradingHistoryRowSchema.safeParse({
        id: UUID,
        source: 'external',
        userId: 'u-1',
        rankId: UUID,
        shogoTitle: null,
        date: '2024-09-01',
        result: 'pass',
        notes: null,
        examiner: 'Sensei Tanaka',
        organisationName: 'Kobe Dojo',
        verified: true,
        verifiedBy: { id: 'u-sys', name: 'Sysadmin' },
        verifiedAt: ISO,
        canVerify: false,
        canEdit: true,
        updatedAt: null,
        updatedByUserId: null,
      }).success,
    ).toBe(true);
  });
});

describe('GradingHistoryResponseSchema', () => {
  it('accepts an empty response', () => {
    expect(GradingHistoryResponseSchema.safeParse({ data: [] }).success).toBe(true);
  });
});
