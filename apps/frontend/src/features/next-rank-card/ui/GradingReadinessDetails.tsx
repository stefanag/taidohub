import { useQuery } from '@tanstack/react-query';
import { Check, Clock } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { GradingAgeBasis } from '@repo/contracts/grading-age';
import type { AgeGroup } from '@repo/contracts/grading-requirements';

import { myProfileQueryOptions } from '@/entities/profile';
import { ageGroupLabel } from '@/entities/rank-requirement';
import {
  computeGradingReadiness,
  daysBetween,
  formatIsoDate,
  nextAgeGroupChange,
  todayIso,
} from '@/shared/lib/grading-readiness';

export interface GradingReadinessDetailsProps {
  lastPassDate: string | null;
  minMonthsSincePreviousRank: number | null;
  minAge: number | null;
  /** How the federation counts age; default exact age on the date. */
  ageBasis?: GradingAgeBasis;
  /** The next rank's age groups, to warn when other requirements will apply. */
  ageGroups?: AgeGroup[];
}

/** Warn about a change of age group this far ahead. */
const AGE_CHANGE_HORIZON_DAYS = 365;

/**
 * The time-in-rank and age gates for the actor's next rank, and the earliest
 * date both are met. Only the hard gates the catalogue records: whether the
 * club lets the student grade is still the instructor's call.
 */
export function GradingReadinessDetails({
  lastPassDate,
  minMonthsSincePreviousRank,
  minAge,
  ageBasis = 'age_on_grading_date',
  ageGroups = [],
}: GradingReadinessDetailsProps): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const profile = useQuery(myProfileQueryOptions());
  if (profile.isPending) return null;

  const today = todayIso();
  const r = computeGradingReadiness({
    lastPassDate,
    minMonthsSincePreviousRank,
    dateOfBirth: profile.data?.dateOfBirth ?? null,
    minAge,
    ageBasis,
    today,
  });
  const dob = profile.data?.dateOfBirth ?? null;
  const change = dob ? nextAgeGroupChange(dob, ageGroups, ageBasis, today) : null;
  const upcoming =
    change && daysBetween(today, change.date) <= AGE_CHANGE_HORIZON_DAYS ? change : null;
  if (r.timeMet === null && r.ageMet === null && !r.incomplete && !upcoming) return null;

  const mark = (met: boolean) =>
    met ? (
      <Check aria-hidden className="size-4 text-primary" />
    ) : (
      <Clock aria-hidden className="size-4 text-on-surface-variant" />
    );

  return (
    <div data-testid="grading-readiness" className="space-y-1 border-t pt-2 text-sm">
      {r.timeMet !== null ? (
        <p className="flex items-center gap-2">
          {mark(r.timeMet)}
          {t('gradingReadiness.timeInRank', {
            months: r.monthsInRank ?? 0,
            min: minMonthsSincePreviousRank,
          })}
        </p>
      ) : null}
      {r.ageMet !== null ? (
        <p className="flex items-center gap-2">
          {mark(r.ageMet)}
          {t('gradingReadiness.minAge', { age: minAge })}
        </p>
      ) : null}
      {upcoming ? (
        <p data-testid="grading-readiness-age-change">
          {t('gradingReadiness.ageGroupChange', {
            date: formatIsoDate(upcoming.date, i18n.language),
            group: upcoming.group
              ? ageGroupLabel(upcoming.group, t)
              : t('ageGroups.allAges').toLowerCase(),
          })}
        </p>
      ) : null}
      {r.incomplete ? (
        <p className="text-on-surface-variant">
          {minAge && !profile.data?.dateOfBirth
            ? t('gradingReadiness.missingDateOfBirth')
            : t('gradingReadiness.missingPass')}
        </p>
      ) : r.earliestDate === null ? null : r.earliestDate <= today ? (
        <p className="font-medium" data-testid="grading-readiness-met">
          {t('gradingReadiness.met')}
        </p>
      ) : (
        <p className="font-medium" data-testid="grading-readiness-earliest">
          {t('gradingReadiness.earliest', { date: formatIsoDate(r.earliestDate, i18n.language) })}
        </p>
      )}
    </div>
  );
}
