import { describe, expect, it } from 'vitest';

import {
  CreateOrganisationSchema,
  OrganisationSchema,
  UpdateOrganisationSchema,
  isIsoAlpha3,
} from '../organisations.js';

const VALID_BASE = {
  parentId: null,
  type: 'international_federation' as const,
  shortCode: 'WTF',
  slug: 'world-taido-federation',
  country: 'JPN',
  nameEn: 'World Taido Federation',
  nameSv: 'Världstaidoförbundet',
  nameFi: 'Maailman Taidoliitto',
  nameJa: '世界躰道連盟',
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
};

describe('isIsoAlpha3', () => {
  it('accepts known codes', () => {
    expect(isIsoAlpha3('SWE')).toBe(true);
    expect(isIsoAlpha3('FIN')).toBe(true);
    expect(isIsoAlpha3('JPN')).toBe(true);
  });

  it('rejects unknown / lowercase', () => {
    expect(isIsoAlpha3('XXX')).toBe(false);
    expect(isIsoAlpha3('swe')).toBe(false);
  });
});

describe('CreateOrganisationSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = CreateOrganisationSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it('rejects unknown country codes', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, country: 'XYZ' });
    expect(result.success).toBe(false);
  });

  it('rejects bad type', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, type: 'school' });
    expect(result.success).toBe(false);
  });

  it('rejects empty required name', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, nameEn: '' });
    expect(result.success).toBe(false);
  });

  it('allows nullable name_ja', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, nameJa: null });
    expect(result.success).toBe(true);
  });
});

describe('UpdateOrganisationSchema', () => {
  it('rejects `type` field', () => {
    const result = UpdateOrganisationSchema.safeParse({ type: 'club' });
    expect(result.success).toBe(false);
  });

  it('accepts a partial update', () => {
    const result = UpdateOrganisationSchema.safeParse({ nameEn: 'New name' });
    expect(result.success).toBe(true);
  });
});

describe('OrganisationSchema', () => {
  it('requires id, timestamps', () => {
    const result = OrganisationSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(false);
  });
});
