import { describe, expect, it } from 'vitest';

import type { UserStatsRankCoverage } from '@repo/contracts/statistics';

import { currentRank } from './currentRank.js';

function coverage(sortOrder: number, id = `r-${sortOrder}`): UserStatsRankCoverage {
  return {
    rank: {
      id,
      nameRomaji: `rank-${sortOrder}`,
      nameEn: `Rank ${sortOrder}`,
      sortOrder,
    },
    coveragePct: 50,
  };
}

describe('currentRank', () => {
  it('returns undefined for an empty array', () => {
    expect(currentRank([])).toBeUndefined();
  });

  it('returns the single row when the array has one', () => {
    const row = coverage(10);
    expect(currentRank([row])).toBe(row);
  });

  it('returns the row with the highest sortOrder', () => {
    const lo = coverage(5, 'lo');
    const mid = coverage(10, 'mid');
    const hi = coverage(20, 'hi');
    expect(currentRank([lo, hi, mid])).toBe(hi);
  });

  it('is stable when two rows share the highest sortOrder (returns first match)', () => {
    // Not a strong guarantee — but pin the behaviour so callers aren't
    // surprised by an implementation change.
    const a = coverage(10, 'a');
    const b = coverage(10, 'b');
    expect(currentRank([a, b])).toBe(a);
  });
});
