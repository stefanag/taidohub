import { z } from './zod-openapi.js';

/**
 * How a student's age is counted for grading requirements and a rank's
 * minimum age. Chosen per national federation and applied to every club in
 * that country; null on the federation means `age_on_grading_date`. See
 * docs/superpowers/plans/2026-11-28-age-based-grading-requirements.md.
 *
 * - `age_on_grading_date`: whole years on the day of the grading.
 * - `age_reached_in_grading_year`: the age reached during the calendar year
 *   of the grading (birth-year counting).
 */
export const GRADING_AGE_BASES = ['age_on_grading_date', 'age_reached_in_grading_year'] as const;
export const GradingAgeBasisSchema = z.enum(GRADING_AGE_BASES).meta({
  id: 'GradingAgeBasis',
  description: 'Exact age on the grading date, or the age reached during the grading year.',
});
export type GradingAgeBasis = z.infer<typeof GradingAgeBasisSchema>;

export const DEFAULT_GRADING_AGE_BASIS: GradingAgeBasis = 'age_on_grading_date';

/** An age group: both bounds inclusive, null means unbounded on that side. */
export interface AgeBounds {
  ageFrom: number | null;
  ageTo: number | null;
}

function parts(isoDate: string): [number, number, number] {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

/** The student's age for a grading on `gradingDate` (both YYYY-MM-DD). */
export function ageForGrading(dateOfBirth: string, gradingDate: string, basis: GradingAgeBasis): number {
  const [by, bm, bd] = parts(dateOfBirth);
  const [gy, gm, gd] = parts(gradingDate);
  if (basis === 'age_reached_in_grading_year') return gy - by;
  return gy - by - (gm < bm || (gm === bm && gd < bd) ? 1 : 0);
}

/**
 * The first date on which `ageForGrading` is at least `age`: the birthday
 * (29 February becomes 1 March in common years), or 1 January of that year
 * under birth-year counting.
 */
export function dateAgeReached(dateOfBirth: string, age: number, basis: GradingAgeBasis): string {
  const [by, bm, bd] = parts(dateOfBirth);
  const year = by + age;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (basis === 'age_reached_in_grading_year') return `${year}-01-01`;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (bm === 2 && bd === 29 && !leap) return `${year}-03-01`;
  return `${year}-${pad(bm)}-${pad(bd)}`;
}

export function ageGroupContains(group: AgeBounds, age: number): boolean {
  return (group.ageFrom === null || age >= group.ageFrom) && (group.ageTo === null || age <= group.ageTo);
}

export function ageGroupsOverlap(a: AgeBounds, b: AgeBounds): boolean {
  const aFrom = a.ageFrom ?? Number.NEGATIVE_INFINITY;
  const aTo = a.ageTo ?? Number.POSITIVE_INFINITY;
  const bFrom = b.ageFrom ?? Number.NEGATIVE_INFINITY;
  const bTo = b.ageTo ?? Number.POSITIVE_INFINITY;
  return aFrom <= bTo && bFrom <= aTo;
}
