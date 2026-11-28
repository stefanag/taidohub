import { describe, expect, it } from 'vitest';

import { ageGroupLabel } from './ageGroup.js';

import i18n from '@/i18n';

describe('ageGroupLabel', () => {
  it('names open and closed groups', async () => {
    await i18n.changeLanguage('sv');
    const t = i18n.t.bind(i18n);
    expect(ageGroupLabel({ ageFrom: null, ageTo: 11 }, t)).toBe('Under 12 år');
    expect(ageGroupLabel({ ageFrom: 12, ageTo: 15 }, t)).toBe('12–15 år');
    expect(ageGroupLabel({ ageFrom: 16, ageTo: null }, t)).toBe('16 år och äldre');
    expect(ageGroupLabel({ ageFrom: 10, ageTo: 10 }, t)).toBe('10 år');
  });
});
