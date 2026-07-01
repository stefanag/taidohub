import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useNextRank } from '../lib/useNextRank.js';

import { useSession } from '@/entities/me';
import { useProgressListQuery } from '@/entities/progress';
import { useRequirementsForUserQuery, useRequirementsQuery } from '@/entities/rank-requirement';
import { useStudentProgressQuery } from '@/entities/student';
import { calculateRankProgress } from '@/shared/lib/rankProgress';
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@/shared/ui';

export interface NextRankCardProps {
  /** Student to show progress for. Defaults to the current actor. */
  userId?: string;
}

/**
 * Compact "next rank" progress card for the dashboard and history pages.
 * Shows a progress bar + "{ready}/{total} requirements ready" caption for
 * the student's next rank in their belt system, or an empty state when the
 * student is already at the highest rank (no `nextRankId`).
 */
export function NextRankCard({ userId: userIdProp }: NextRankCardProps): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const actorId = session.data?.user?.id ?? '';
  const userId = userIdProp ?? actorId;
  const isActor = !userIdProp || userIdProp === actorId;

  const { nextRank, isPending: rankPending, isError: rankError } = useNextRank(userId);

  const requirementsQueryForActor = useRequirementsQuery(isActor ? (nextRank?.id ?? null) : null);
  const requirementsQueryForUser = useRequirementsForUserQuery(
    isActor ? null : (nextRank?.id ?? null),
    isActor ? null : userId,
  );
  const requirementsQuery = isActor ? requirementsQueryForActor : requirementsQueryForUser;

  // Progress is actor-scoped by default (`useProgressListQuery` reads the
  // caller's own rows). When `userId` points at another user (instructor
  // viewing a student), fetch that student's progress via the student-scoped
  // endpoint instead — otherwise the actor's own progress would be shown
  // under the student's name (Task 22 cross-user gap, fixed in Task 25).
  const actorTechProgressQuery = useProgressListQuery('technique');
  const actorPatProgressQuery = useProgressListQuery('pattern');
  const studentProgressQuery = useStudentProgressQuery(isActor ? null : userId);

  const studentTechProgress = React.useMemo(
    () => (studentProgressQuery.data ?? []).filter((p) => p.contentType === 'technique'),
    [studentProgressQuery.data],
  );
  const studentPatProgress = React.useMemo(
    () => (studentProgressQuery.data ?? []).filter((p) => p.contentType === 'pattern'),
    [studentProgressQuery.data],
  );

  const techProgressQuery = isActor
    ? actorTechProgressQuery
    : { ...studentProgressQuery, data: studentTechProgress };
  const patProgressQuery = isActor
    ? actorPatProgressQuery
    : { ...studentProgressQuery, data: studentPatProgress };

  const isPending =
    rankPending ||
    (Boolean(nextRank) &&
      (requirementsQuery.isPending || techProgressQuery.isPending || patProgressQuery.isPending));
  const isError =
    rankError || requirementsQuery.isError || techProgressQuery.isError || patProgressQuery.isError;

  const { ready, total, pct } = React.useMemo(() => {
    if (!requirementsQuery.data) return { ready: 0, total: 0, pct: 0 };
    return calculateRankProgress(
      requirementsQuery.data,
      techProgressQuery.data ?? [],
      patProgressQuery.data ?? [],
    );
  }, [requirementsQuery.data, techProgressQuery.data, patProgressQuery.data]);

  return (
    <Card data-testid="next-rank-card">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {t('nextRank.title', { defaultValue: 'Next rank' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isPending ? (
          <p className="text-sm text-on-surface-variant">
            {t('nextRank.loading', { defaultValue: 'Loading…' })}
          </p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('common.unknownError', { defaultValue: 'unknown error' })}
          </p>
        ) : !nextRank ? (
          <p className="text-sm text-on-surface-variant">
            {t('nextRank.atHighest', { defaultValue: "You've reached the highest rank" })}
          </p>
        ) : (
          <>
            <Progress value={pct} />
            <p className="text-sm text-on-surface-variant">
              {t('nextRank.caption', {
                defaultValue: '{{ready}}/{{total}} requirements ready',
                ready,
                total,
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
