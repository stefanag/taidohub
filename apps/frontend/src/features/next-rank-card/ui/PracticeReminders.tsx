import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { practiceReminders, type PracticeReminder } from '../lib/practiceReminders.js';
import { useNextRank } from '../lib/useNextRank.js';

import { useSession } from '@/entities/me';
import { usePatternsQuery } from '@/entities/pattern';
import { useProgressListQuery } from '@/entities/progress';
import { useRequirementsQuery } from '@/entities/rank-requirement';
import { useTechniquesQuery } from '@/entities/technique';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { daysBetween, todayIso } from '@/shared/lib/grading-readiness';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui';

/** Requirements not practised for this many days get a reminder. */
export const PRACTICE_REMINDER_DAYS = 28;
const SHOWN = 5;

/**
 * "Time to practise again": techniques and patterns required for the actor's
 * next rank whose "last practised" date is older than four weeks, or unset.
 * Oldest first, at most five. In-app only (no email). Renders nothing when
 * the training-log flag is off or nothing is due.
 */
export function PracticeReminders(): React.ReactElement | null {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('training-log');
  const session = useSession();
  const { nextRank } = useNextRank(session.data?.user?.id ?? '');
  const requirements = useRequirementsQuery(enabled ? (nextRank?.id ?? null) : null);
  const techniques = useTechniquesQuery();
  const patterns = usePatternsQuery();
  const techProgress = useProgressListQuery('technique', { enabled });
  const patProgress = useProgressListQuery('pattern', { enabled });

  const today = todayIso();
  const due = React.useMemo<PracticeReminder[]>(() => {
    if (
      !requirements.data ||
      !techniques.data ||
      !patterns.data ||
      !techProgress.data ||
      !patProgress.data
    )
      return [];
    return practiceReminders({
      requirements: requirements.data,
      progress: [...techProgress.data, ...patProgress.data],
      names: new Map([
        ...techniques.data.map((x) => [x.id, x.nameRomaji] as const),
        ...patterns.data.map((x) => [x.id, x.nameRomaji] as const),
      ]),
      today,
      thresholdDays: PRACTICE_REMINDER_DAYS,
    });
  }, [
    requirements.data,
    techniques.data,
    patterns.data,
    techProgress.data,
    patProgress.data,
    today,
  ]);

  if (!enabled || due.length === 0) return null;

  return (
    <Card data-testid="practice-reminders">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t('practiceReminders.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-on-surface-variant">
          {t('practiceReminders.intro', { days: PRACTICE_REMINDER_DAYS })}
        </p>
        <ul className="space-y-1 text-sm">
          {due.slice(0, SHOWN).map((item) => (
            <li key={item.id} className="flex justify-between gap-4">
              <span>{item.name}</span>
              <span className="text-on-surface-variant">
                {item.lastPracticedAt
                  ? t('practiceReminders.daysAgo', {
                      count: daysBetween(item.lastPracticedAt, today),
                    })
                  : t('practiceReminders.never')}
              </span>
            </li>
          ))}
        </ul>
        {due.length > SHOWN ? (
          <p className="text-sm text-on-surface-variant">
            {t('practiceReminders.more', { count: due.length - SHOWN })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
