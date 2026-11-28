import { describe, expect, it } from 'vitest';

import { ageForGrading, ageGroupContains, ageGroupsOverlap, dateAgeReached } from '../grading-age.js';

describe('ageForGrading', () => {
  it('counts whole years on the grading date', () => {
    expect(ageForGrading('2010-06-15', '2026-06-14', 'age_on_grading_date')).toBe(15);
    expect(ageForGrading('2010-06-15', '2026-06-15', 'age_on_grading_date')).toBe(16);
    expect(ageForGrading('2010-12-31', '2026-01-01', 'age_on_grading_date')).toBe(15);
  });

  it('counts the age reached during the grading year', () => {
    expect(ageForGrading('2010-12-31', '2026-01-01', 'age_reached_in_grading_year')).toBe(16);
    expect(ageForGrading('2010-01-01', '2026-12-31', 'age_reached_in_grading_year')).toBe(16);
  });

  it('handles 29 February', () => {
    expect(ageForGrading('2008-02-29', '2026-02-28', 'age_on_grading_date')).toBe(17);
    expect(ageForGrading('2008-02-29', '2026-03-01', 'age_on_grading_date')).toBe(18);
  });
});

describe('dateAgeReached', () => {
  it('is the birthday, or 1 January under birth-year counting', () => {
    expect(dateAgeReached('2010-06-15', 16, 'age_on_grading_date')).toBe('2026-06-15');
    expect(dateAgeReached('2010-06-15', 16, 'age_reached_in_grading_year')).toBe('2026-01-01');
    expect(dateAgeReached('2008-02-29', 18, 'age_on_grading_date')).toBe('2026-03-01');
    expect(dateAgeReached('2008-02-29', 20, 'age_on_grading_date')).toBe('2028-02-29');
  });

  it('agrees with ageForGrading', () => {
    for (const basis of ['age_on_grading_date', 'age_reached_in_grading_year'] as const) {
      const d = dateAgeReached('2011-09-03', 14, basis);
      expect(ageForGrading('2011-09-03', d, basis)).toBe(14);
    }
  });
});

describe('age groups', () => {
  it('contain ages inclusively and detect overlap', () => {
    expect(ageGroupContains({ ageFrom: null, ageTo: 11 }, 11)).toBe(true);
    expect(ageGroupContains({ ageFrom: 12, ageTo: 15 }, 16)).toBe(false);
    expect(ageGroupsOverlap({ ageFrom: null, ageTo: 11 }, { ageFrom: 12, ageTo: 15 })).toBe(false);
    expect(ageGroupsOverlap({ ageFrom: 12, ageTo: 15 }, { ageFrom: 15, ageTo: null })).toBe(true);
  });
});
