import { describe, expect, it } from 'vitest';

import {
  CreateOrganisationSchema,
  OrganisationSchema,
  UpdateOrganisationSchema,
  isIsoAlpha3,
} from '../organisations.js';

// A valid national-federation payload. Use NF (not IF) as the baseline so
// every test starts with `country` set; tests that need an IF override
// `type` and `country` together.
const VALID_BASE = {
  parentId: '00000000-0000-0000-0000-000000000000',
  type: 'national_federation' as const,
  shortCode: 'STF',
  slug: 'swedish-taido-federation',
  country: 'SWE' as const,
  nameEn: 'Swedish Taido Federation',
  nameSv: 'Svenska Taidoförbundet',
  nameFi: 'Ruotsin Taidoliitto',
  nameJa: null,
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
};

const VALID_IF = {
  ...VALID_BASE,
  parentId: null,
  type: 'international_federation' as const,
  shortCode: 'WTF',
  country: null,
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

  it('accepts an international federation with country: null', () => {
    const result = CreateOrganisationSchema.safeParse(VALID_IF);
    expect(result.success).toBe(true);
  });

  it('rejects an international federation with a country code', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_IF, country: 'JPN' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'country')).toBe(true);
    }
  });

  it('rejects a national federation with country: null', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, country: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'country')).toBe(true);
    }
  });

  it('rejects a club with country: null', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, type: 'club', country: null });
    expect(result.success).toBe(false);
  });
});

describe('UpdateOrganisationSchema', () => {
  it('silently strips `type` field (immutable, enforced by repo allow-list)', () => {
    const result = UpdateOrganisationSchema.safeParse({ type: 'club' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('type' in result.data).toBe(false);
    }
  });

  it('accepts a partial update', () => {
    const result = UpdateOrganisationSchema.safeParse({ nameEn: 'New name' });
    expect(result.success).toBe(true);
  });

  // The country/type cross-field rule depends on the existing row's type,
  // which the patch can't see (type is immutable, so it isn't in the
  // update schema). The schema therefore accepts both null and any valid
  // ISO code on its own — the service layer applies the rule on write.
  it('accepts country: null in isolation (cross-field rule enforced server-side)', () => {
    const result = UpdateOrganisationSchema.safeParse({ country: null });
    expect(result.success).toBe(true);
  });

  it('accepts a valid country code on its own', () => {
    const result = UpdateOrganisationSchema.safeParse({ country: 'SWE' });
    expect(result.success).toBe(true);
  });
});

describe('OrganisationSchema', () => {
  it('requires id, timestamps', () => {
    const result = OrganisationSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(false);
  });
});
