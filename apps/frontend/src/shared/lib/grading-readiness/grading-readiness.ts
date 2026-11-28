import {
  ageForGrading,
  ageGroupContains,
  dateAgeReached,
  type AgeBounds,
  type GradingAgeBasis,
} from '@repo/contracts/grading-age';

/**
 * When a student may grade next, from the two hard gates the catalogue
 * records: time since the previous rank (`minMonthsSincePreviousRank` on the
 * next rank's requirements) and minimum age (`minAge` on the next rank).
 * Pure date arithmetic on ISO dates (YYYY-MM-DD); no time zones involved.
 */

export interface GradingReadinessInput {
  /** Date of the pass that gave the current rank, or null without one. */
  lastPassDate: string | null;
  minMonthsSincePreviousRank: number | null;
  dateOfBirth: string | null;
  minAge: number | null;
  /** How the federation counts age (default: exact age on the date). */
  ageBasis?: GradingAgeBasis;
  /** Today as YYYY-MM-DD. */
  today: string;
}

export interface GradingReadiness {
  /** Whole months since the last pass, or null without one. */
  monthsInRank: number | null;
  /** Null when there is no time requirement, or no pass to count from. */
  timeMet: boolean | null;
  /** Whole years of age, or null without a date of birth. */
  age: number | null;
  /** Null when there is no age requirement, or no date of birth to check it against. */
  ageMet: boolean | null;
  /**
   * The first day both gates are met, or null when neither gate applies or a
   * gate cannot be evaluated. Equal to or before `today` when already met.
   */
  earliestDate: string | null;
  /** Something needed to evaluate a gate is missing (date of birth, a pass). */
  incomplete: boolean;
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const totalMonths = y * 12 + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  // Clamp to the last day of the target month (31 Jan + 1 month = 28/29 Feb).
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** Whole months from `from` to `to` (a month counts once its day is reached). */
export function wholeMonthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (addMonths(from, months) > to) months -= 1;
  return months;
}

export function computeGradingReadiness(input: GradingReadinessInput): GradingReadiness {
  const { lastPassDate, dateOfBirth, today } = input;
  const basis = input.ageBasis ?? 'age_on_grading_date';
  const minMonths =
    input.minMonthsSincePreviousRank && input.minMonthsSincePreviousRank > 0
      ? input.minMonthsSincePreviousRank
      : null;
  const minAge = input.minAge && input.minAge > 0 ? input.minAge : null;

  const monthsInRank = lastPassDate ? wholeMonthsBetween(lastPassDate, today) : null;
  const age = dateOfBirth ? ageForGrading(dateOfBirth, today, basis) : null;

  const timeDate = minMonths !== null && lastPassDate ? addMonths(lastPassDate, minMonths) : null;
  const ageDate = minAge !== null && dateOfBirth ? dateAgeReached(dateOfBirth, minAge, basis) : null;

  const timeMissing = minMonths !== null && !lastPassDate;
  const ageMissing = minAge !== null && !dateOfBirth;
  const gates = [timeDate, ageDate].filter((d): d is string => d !== null);

  return {
    monthsInRank,
    timeMet: timeDate === null ? null : timeDate <= today,
    age,
    ageMet: ageDate === null ? null : ageDate <= today,
    earliestDate: gates.length === 0 || timeMissing || ageMissing ? null : gates.sort().at(-1)!,
    incomplete: timeMissing || ageMissing,
  };
}

/** Today in the browser's local calendar, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** An ISO date in the reader's language, e.g. "10 March 2027". */
export function formatIsoDate(isoDate: string, language: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/**
 * The next date on which a different age group's requirements apply to the
 * student (or the base requirement, `group: null`), after `today`. Null when
 * nothing changes: no groups, or the student is past every boundary.
 */
export function nextAgeGroupChange(
  dateOfBirth: string,
  groups: (AgeBounds & { id: string })[],
  basis: GradingAgeBasis,
  today: string,
): { date: string; group: (AgeBounds & { id: string }) | null } | null {
  if (groups.length === 0) return null;
  const groupAt = (date: string) => {
    const age = ageForGrading(dateOfBirth, date, basis);
    return groups.find((g) => ageGroupContains(g, age)) ?? null;
  };
  const current = groupAt(today);
  const boundaries = groups
    .flatMap((g) => [g.ageFrom, g.ageTo === null ? null : g.ageTo + 1])
    .filter((a): a is number => a !== null)
    .map((a) => dateAgeReached(dateOfBirth, a, basis))
    .filter((d) => d > today)
    .sort();
  for (const date of boundaries) {
    const next = groupAt(date);
    if ((next?.id ?? null) !== (current?.id ?? null)) return { date, group: next };
  }
  return null;
}
