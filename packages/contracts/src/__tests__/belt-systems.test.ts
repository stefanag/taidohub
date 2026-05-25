import { describe, expect, it } from 'vitest';

import {
  BeltSystemSchema,
  CreateBeltSystemSchema,
  UpdateBeltSystemSchema,
} from '../belt-systems.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-24T08:00:00.000Z';

const VALID_ROW = {
  id: UUID,
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: ISO,
  updatedAt: ISO,
};

describe('BeltSystemSchema', () => {
  it('accepts a valid row', () => {
    expect(BeltSystemSchema.safeParse(VALID_ROW).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(BeltSystemSchema.safeParse({ ...VALID_ROW, id: 'nope' }).success).toBe(false);
  });
});

describe('CreateBeltSystemSchema', () => {
  it('accepts a minimal global system', () => {
    expect(
      CreateBeltSystemSchema.safeParse({
        code: 'kyu',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
      }).success,
    ).toBe(true);
  });

  it('rejects a missing localised name', () => {
    expect(
      CreateBeltSystemSchema.safeParse({ code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu' }).success,
    ).toBe(false);
  });

  it('rejects a code longer than 3 chars', () => {
    expect(
      CreateBeltSystemSchema.safeParse({
        code: 'kyus',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
      }).success,
    ).toBe(false);
  });

  it('accepts an explicit null organisationId', () => {
    expect(
      CreateBeltSystemSchema.safeParse({
        code: 'kyu',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
        organisationId: null,
      }).success,
    ).toBe(true);
  });
});

describe('UpdateBeltSystemSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateBeltSystemSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-field patch', () => {
    expect(UpdateBeltSystemSchema.safeParse({ sortOrder: 5 }).success).toBe(true);
  });
});
