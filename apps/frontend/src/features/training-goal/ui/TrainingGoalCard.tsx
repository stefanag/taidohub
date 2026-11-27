import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import {
  countSessionsThisWeek,
  useTrainingGoalQuery,
  useTrainingSessionsQuery,
  weekStart,
} from '@/entities/training-log';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { daysBetween, formatIsoDate, todayIso } from '@/shared/lib/grading-readiness';
import { rankLabel } from '@/shared/lib/rank-label';
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@/shared/ui';

/**
 * Dashboard summary of the personal goals: sessions logged this week against
 * the weekly goal, and the target rank with the days left to its date.
 * Renders nothing while the training-log flag is off.
 */
export function TrainingGoalCard(): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const enabled = useFeatureFlag('training-log');
  const today = todayIso();
  const goal = useTrainingGoalQuery({ enabled });
  const sessions = useTrainingSessionsQuery({ from: weekStart(today) }, { enabled });
  const ranks = useQuery({ ...listBeltRanksQueryOptions(), enabled });

  if (!enabled) return null;

  const g = goal.data;
  const hasGoal = Boolean(g && (g.sessionsPerWeek || g.targetRankId || g.targetDate));
  const done = countSessionsThisWeek(sessions.data ?? [], today);
  const rank = g?.targetRankId ? ranks.data?.find((r) => r.id === g.targetRankId) : undefined;

  return (
    <Card data-testid="training-goal-card">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t('trainingGoal.cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {goal.isPending || sessions.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : goal.isError || sessions.isError ? (
          <p role="alert" className="text-destructive">
            {t('common.unknownError')}
          </p>
        ) : !hasGoal ? (
          <p className="text-on-surface-variant">
            {t('trainingGoal.none')}{' '}
            <Link to="/training" className="text-primary underline">
              {t('trainingGoal.setGoal')}
            </Link>
          </p>
        ) : (
          <>
            {g!.sessionsPerWeek ? (
              <div className="space-y-1">
                <Progress value={Math.min(100, Math.round((done / g!.sessionsPerWeek) * 100))} />
                <p data-testid="training-goal-week">
                  {t('trainingGoal.thisWeek', { done, goal: g!.sessionsPerWeek })}
                </p>
              </div>
            ) : (
              <p data-testid="training-goal-week">
                {t('trainingGoal.thisWeekNoGoal', { count: done })}
              </p>
            )}
            {g!.targetDate ? (
              <p data-testid="training-goal-target">
                {rank
                  ? t('trainingGoal.targetRankBy', {
                      rank: rankLabel(rank, i18n.language),
                      date: formatIsoDate(g!.targetDate, i18n.language),
                    })
                  : t('trainingGoal.targetBy', {
                      date: formatIsoDate(g!.targetDate, i18n.language),
                    })}{' '}
                <span className="text-on-surface-variant">
                  {daysBetween(today, g!.targetDate) >= 0
                    ? t('trainingGoal.daysLeft', { count: daysBetween(today, g!.targetDate) })
                    : t('trainingGoal.datePassed')}
                </span>
              </p>
            ) : rank ? (
              <p data-testid="training-goal-target">
                {t('trainingGoal.targetRankOnly', { rank: rankLabel(rank, i18n.language) })}
              </p>
            ) : null}
            <Link to="/training" className="text-primary underline">
              {t('trainingGoal.openLog')}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
