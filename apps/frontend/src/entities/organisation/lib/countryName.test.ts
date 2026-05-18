import { describe, expect, it } from 'vitest';

import { countryName } from './countryName.js';

describe('countryName', () => {
  it('returns the English name for a known code', () => {
    expect(countryName('SWE', 'en')).toBe('Sweden');
    expect(countryName('JPN', 'en')).toBe('Japan');
    expect(countryName('USA', 'en')).toBe('United States');
  });

  it('localises into Swedish', () => {
    expect(countryName('SWE', 'sv')).toMatch(/Sverige/i);
    expect(countryName('JPN', 'sv')).toMatch(/Japan/i);
  });

  it('localises into Finnish', () => {
    expect(countryName('FIN', 'fi')).toMatch(/Suomi/i);
    expect(countryName('JPN', 'fi')).toMatch(/Japani/i);
  });

  it('strips locale subtags (en-US → en)', () => {
    expect(countryName('SWE', 'en-US')).toBe('Sweden');
  });
});
