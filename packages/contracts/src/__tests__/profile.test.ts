import { describe, expect, it } from 'vitest';

import { UpdateUserProfileSchema, UserProfileSchema } from '../profile.js';

const FULL_PROFILE = {
  userId: 'u-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  taidoStartDate: '2015-09-01',
  addressStreet: '12 Analytical Way',
  addressPostalCode: '11122',
  addressCity: 'Stockholm',
  addressCountry: 'SWE',
  citizenships: ['SWE', 'GBR'],
  aboutMe: null,
};

const EMPTY_PROFILE = {
  userId: 'u-1',
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  taidoStartDate: null,
  addressStreet: null,
  addressPostalCode: null,
  addressCity: null,
  addressCountry: null,
  citizenships: [],
  aboutMe: null,
};

describe('UserProfileSchema', () => {
  it('accepts a fully-populated profile', () => {
    expect(UserProfileSchema.safeParse(FULL_PROFILE).success).toBe(true);
  });

  it('accepts an all-null profile with an empty citizenships array', () => {
    expect(UserProfileSchema.safeParse(EMPTY_PROFILE).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      UserProfileSchema.safeParse({ ...FULL_PROFILE, dateOfBirth: '2026-13-99' }).success,
    ).toBe(false);
  });

  it('rejects an unknown country code in addressCountry', () => {
    expect(
      UserProfileSchema.safeParse({ ...FULL_PROFILE, addressCountry: 'XXX' }).success,
    ).toBe(false);
  });

  it('rejects an unknown country code inside citizenships', () => {
    expect(
      UserProfileSchema.safeParse({ ...FULL_PROFILE, citizenships: ['SWE', 'XXX'] }).success,
    ).toBe(false);
  });
});

describe('UpdateUserProfileSchema', () => {
  it('accepts a partial patch', () => {
    expect(UpdateUserProfileSchema.safeParse({ firstName: 'Ada' }).success).toBe(true);
  });

  it('accepts explicit nulls to clear fields', () => {
    expect(
      UpdateUserProfileSchema.safeParse({ firstName: null, dateOfBirth: null, addressCountry: null })
        .success,
    ).toBe(true);
  });

  it('accepts an empty patch', () => {
    expect(UpdateUserProfileSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a bad date', () => {
    expect(UpdateUserProfileSchema.safeParse({ dateOfBirth: '2026-13-99' }).success).toBe(false);
  });

  it('rejects an unknown country code', () => {
    expect(UpdateUserProfileSchema.safeParse({ addressCountry: 'XXX' }).success).toBe(false);
  });

  it('rejects an over-long firstName', () => {
    expect(UpdateUserProfileSchema.safeParse({ firstName: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('UserProfileSchema — aboutMe', () => {
  const baseRow = {
    userId: 'u-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1990-12-10',
    taidoStartDate: '2015-09-01',
    addressStreet: '12 Analytical Way',
    addressPostalCode: '11122',
    addressCity: 'Stockholm',
    addressCountry: 'SWE' as const,
    citizenships: ['SWE', 'GBR'],
  };

  it('accepts aboutMe: null', () => {
    expect(UserProfileSchema.safeParse({ ...baseRow, aboutMe: null }).success).toBe(true);
  });

  it('accepts a Delta-shaped aboutMe', () => {
    expect(
      UserProfileSchema.safeParse({
        ...baseRow,
        aboutMe: { ops: [{ insert: 'Sample bio\n' }] },
      }).success,
    ).toBe(true);
  });

  it('rejects aboutMe with a non-array ops field', () => {
    expect(
      UserProfileSchema.safeParse({ ...baseRow, aboutMe: { ops: 'nope' } }).success,
    ).toBe(false);
  });
});

describe('UpdateUserProfileSchema — aboutMe', () => {
  it('accepts an empty patch (no aboutMe key)', () => {
    expect(UpdateUserProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts aboutMe: null', () => {
    expect(UpdateUserProfileSchema.safeParse({ aboutMe: null }).success).toBe(true);
  });

  it('accepts a small Delta', () => {
    expect(
      UpdateUserProfileSchema.safeParse({
        aboutMe: { ops: [{ insert: 'Short bio\n' }] },
      }).success,
    ).toBe(true);
  });

  it('rejects a Delta whose stringified size exceeds 50 KB', () => {
    const big = 'x'.repeat(60_000);
    expect(
      UpdateUserProfileSchema.safeParse({ aboutMe: { ops: [{ insert: big }] } }).success,
    ).toBe(false);
  });
});
