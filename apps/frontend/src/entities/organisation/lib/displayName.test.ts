import { describe, expect, it } from 'vitest';
import { displayName } from './displayName.js';

const ORG = {
  id: 'x', parentId: null, type: 'club' as const, shortCode: 'X', slug: null, country: 'SWE' as const,
  nameEn: 'Stockholm', nameSv: 'Stockholm SE', nameFi: 'Tukholma', nameJa: 'ストックホルム',
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: '', updatedAt: '',
};

describe('displayName', () => {
  it('returns the locale-matching name', () => {
    expect(displayName(ORG, 'sv')).toBe('Stockholm SE');
    expect(displayName(ORG, 'fi')).toBe('Tukholma');
    expect(displayName(ORG, 'ja')).toBe('ストックホルム');
  });

  it('falls back to English for unknown locale', () => {
    expect(displayName(ORG, 'de')).toBe('Stockholm');
  });

  it('falls back to English when locale-specific value is null/empty', () => {
    expect(displayName({ ...ORG, nameJa: null }, 'ja')).toBe('Stockholm');
  });
});
