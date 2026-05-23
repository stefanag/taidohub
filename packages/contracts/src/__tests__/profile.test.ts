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
