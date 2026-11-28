import { describe, expect, it } from 'vitest';

import {
  addMonths,
  computeGradingReadiness,
  daysBetween,
  nextAgeGroupChange,
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

describe('age basis and age groups', () => {
  it('meets the minimum age on 1 January under birth-year counting', () => {
    const r = computeGradingReadiness({
      lastPassDate: null,
      minMonthsSincePreviousRank: null,
      dateOfBirth: '2008-11-30',
      minAge: 18,
      ageBasis: 'age_reached_in_grading_year',
      today: '2026-01-15',
    });
    expect(r).toMatchObject({ age: 18, ageMet: true, earliestDate: '2026-01-01' });
  });

  it('finds the next change of age group', () => {
    const groups = [
      { id: 'young', ageFrom: null, ageTo: 11 },
      { id: 'teen', ageFrom: 12, ageTo: 15 },
    ];
    expect(nextAgeGroupChange('2014-06-15', groups, 'age_on_grading_date', '2026-01-10')).toEqual({
      date: '2026-06-15',
      group: groups[1],
    });
    expect(nextAgeGroupChange('2010-06-15', groups, 'age_reached_in_grading_year', '2025-03-01')).toEqual({
      date: '2026-01-01',
      group: null,
    });
    expect(nextAgeGroupChange('1990-01-01', groups, 'age_on_grading_date', '2026-01-10')).toBeNull();
  });
});
