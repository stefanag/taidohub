import { describe, expect, it } from 'vitest';

import {
  CreateShogoTitleSchema,
  ShogoTitleSchema,
  UpdateShogoTitleSchema,
} from '../shogo-titles.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const VALID = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: UUID,
  sortOrder: 1,
};

describe('ShogoTitleSchema', () => {
  it('accepts a valid row', () => {
    expect(ShogoTitleSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a missing nameJa', () => {
    expect(
      ShogoTitleSchema.safeParse({ ...VALID, nameJa: undefined }).success,
    ).toBe(false);
  });
});

describe('CreateShogoTitleSchema', () => {
  it('accepts a minimal create', () => {
    expect(CreateShogoTitleSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a code longer than 30 chars', () => {
    expect(
      CreateShogoTitleSchema.safeParse({ ...VALID, code: 'a'.repeat(31) }).success,
    ).toBe(false);
  });
});

describe('UpdateShogoTitleSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateShogoTitleSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-field patch', () => {
    expect(UpdateShogoTitleSchema.safeParse({ sortOrder: 9 }).success).toBe(true);
  });
});
