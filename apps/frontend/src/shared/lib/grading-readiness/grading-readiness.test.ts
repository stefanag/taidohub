import { describe, expect, it } from 'vitest';

import {
  addMonths,
  computeGradingReadiness,
  daysBetween,
  wholeMonthsBetween,
} from './grading-readiness.js';

describe('date helpers', () => {
  it('adds months, clamping to the end of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('counts a month once its day is reached', () => {
    expect(wholeMonthsBetween('2026-05-20', '2026-11-19')).toBe(5);
    expect(wholeMonthsBetween('2026-05-20', '2026-11-20')).toBe(6);
  });

  it('counts days', () => {
    expect(daysBetween('2026-11-27', '2026-12-25')).toBe(28);
  });
});

describe('computeGradingReadiness', () => {
  const base = {
    lastPassDate: '2026-06-01',
    minMonthsSincePreviousRank: 6,
    dateOfBirth: '2014-03-10',
    minAge: 13,
    today: '2026-11-27',
  };

  it('takes the later of the two gates as the earliest date', () => {
    const r = computeGradingReadiness(base);
    expect(r).toMatchObject({
      monthsInRank: 5,
      timeMet: false,
      age: 12,
      ageMet: false,
      incomplete: false,
    });
    expect(r.earliestDate).toBe('2027-03-10');
  });

  it('is met when both gates are in the past', () => {
    const r = computeGradingReadiness({ ...base, today: '2027-04-01' });
    expect(r.timeMet && r.ageMet).toBe(true);
    expect(r.earliestDate! <= '2027-04-01').toBe(true);
  });

  it('ignores gates the rank does not have', () => {
    const r = computeGradingReadiness({ ...base, minAge: null, minMonthsSincePreviousRank: 0 });
    expect(r).toMatchObject({ timeMet: null, ageMet: null, earliestDate: null, incomplete: false });
  });

  it('flags a missing date of birth instead of guessing', () => {
    const r = computeGradingReadiness({ ...base, dateOfBirth: null });
    expect(r).toMatchObject({ ageMet: null, earliestDate: null, incomplete: true, timeMet: false });
  });
});
