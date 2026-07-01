import { describe, expect, it } from 'vitest';

import {
  BeltRankSchema,
  CreateBeltRankSchema,
  PublicRankResponseSchema,
  UpdateBeltRankSchema,
} from '../ranks.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-24T08:00:00.000Z';

const VALID_CREATE = {
  systemId: UUID,
  level: 1,
  sortOrder: 10,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
  beltColor: '#FFFFFF',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  organisationId: null,
};

describe('CreateBeltRankSchema', () => {
  it('accepts a minimal rank', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        systemId: UUID,
        level: 1,
        nameRomaji: 'Jukyu',
        beltColor: '#FFFFFF',
      }).success,
    ).toBe(true);
  });

  it('accepts a fully-populated rank', () => {
    expect(CreateBeltRankSchema.safeParse(VALID_CREATE).success).toBe(true);
  });

  it('accepts level 0 (white belt / mukyu)', () => {
    expect(
      CreateBeltRankSchema.safeParse({ ...VALID_CREATE, level: 0 }).success,
    ).toBe(true);
  });

  it('rejects a negative level', () => {
    expect(
      CreateBeltRankSchema.safeParse({ ...VALID_CREATE, level: -1 }).success,
    ).toBe(false);
  });

  it('rejects a non-hex beltColor', () => {
    expect(
      CreateBeltRankSchema.safeParse({ ...VALID_CREATE, beltColor: 'red' }).success,
    ).toBe(false);
  });

  it('rejects publiclyVisible:true with no slug', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        ...VALID_CREATE,
        publiclyVisible: true,
        slug: null,
      }).success,
    ).toBe(false);
  });

  it('accepts publiclyVisible:true with a valid slug', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        ...VALID_CREATE,
        publiclyVisible: true,
        slug: 'jukyu',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid slug shape', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        ...VALID_CREATE,
        publiclyVisible: true,
        slug: 'Jukyu!',
      }).success,
    ).toBe(false);
  });
});

describe('UpdateBeltRankSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateBeltRankSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-field patch', () => {
    expect(UpdateBeltRankSchema.safeParse({ sortOrder: 50 }).success).toBe(true);
  });

  it('rejects publiclyVisible:true with no slug when both are present', () => {
    expect(
      UpdateBeltRankSchema.safeParse({ publiclyVisible: true, slug: null }).success,
    ).toBe(false);
  });
});

describe('BeltRankSchema', () => {
  it('accepts a full read row', () => {
    expect(
      BeltRankSchema.safeParse({
        ...VALID_CREATE,
        visuals: { gradient: 'white' },
        id: UUID,
        createdAt: ISO,
        updatedAt: ISO,
      }).success,
    ).toBe(true);
  });
});

describe('PublicRankResponseSchema', () => {
  const RANK = {
    id: UUID,
    organisationId: null,
    systemId: UUID,
    level: 1,
    sortOrder: 10,
    nameJa: null,
    nameRomaji: 'Jukyu',
    nameEn: '10th Kyu',
    nameSv: '10 Kyu',
    nameFi: '10. Kyu',
    beltColor: '#FFFFFF',
    visuals: { gradient: 'white' },
    imageUrl: null,
    descriptionEn: null,
    descriptionSv: null,
    descriptionFi: null,
    publiclyVisible: true,
    slug: 'jukyu',
    minAge: null,
    nextRankId: null,
    createdAt: ISO,
    updatedAt: ISO,
  };
  const SYSTEM = { id: UUID, code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu' };

  it('accepts a full payload with a non-null organisation and null requirements', () => {
    expect(
      PublicRankResponseSchema.safeParse({
        rank: RANK,
        system: SYSTEM,
        organisation: null,
        requirements: null,
      }).success,
    ).toBe(true);
  });

  it('accepts a payload with a populated requirements projection', () => {
    expect(
      PublicRankResponseSchema.safeParse({
        rank: RANK,
        system: SYSTEM,
        organisation: null,
        requirements: {
          rankId: UUID,
          setId: UUID,
          hokeiGroups: [],
          kobo: [],
          koboTested: [],
          otherPatterns: [],
          otherPatternsTested: [],
          kihon: [],
          kihonTested: [],
          jissenMinutes: null,
          jissenTested: false,
          minMonthsSincePreviousRank: null,
          requiresTheoricExam: false,
          requiresEssay: false,
        },
      }).success,
    ).toBe(true);
  });

  it('rejects a payload missing the requirements field', () => {
    expect(
      PublicRankResponseSchema.safeParse({
        rank: RANK,
        system: SYSTEM,
        organisation: null,
      }).success,
    ).toBe(false);
  });
});
