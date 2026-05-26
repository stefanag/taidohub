import { describe, expect, it } from 'vitest';

import { rankLabel } from './rank-label.js';

const RANK = {
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
};

describe('rankLabel', () => {
  it('returns "{romaji} — {english}" for lang=en', () => {
    expect(rankLabel(RANK, 'en')).toBe('Jukyu — 10th Kyu');
  });

  it('returns Finnish locale for lang=fi', () => {
    expect(rankLabel(RANK, 'fi')).toBe('Jukyu — 10. Kyu');
  });

  it('returns Swedish locale for lang=sv', () => {
    expect(rankLabel(RANK, 'sv')).toBe('Jukyu — 10 Kyu');
  });

  it('narrows BCP-47 tags (en-US → en)', () => {
    expect(rankLabel(RANK, 'en-US')).toBe('Jukyu — 10th Kyu');
  });

  it('falls back to English for unknown lang', () => {
    expect(rankLabel(RANK, 'de')).toBe('Jukyu — 10th Kyu');
  });

  it('returns romaji only when the localised name is empty', () => {
    expect(rankLabel({ ...RANK, nameEn: '' }, 'en')).toBe('Jukyu');
  });
});
