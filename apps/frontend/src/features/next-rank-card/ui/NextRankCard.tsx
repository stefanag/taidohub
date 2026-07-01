import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useNextRank } from '../lib/useNextRank.js';

import { useSession } from '@/entities/me';
import { useProgressListQuery } from '@/entities/progress';
import { useRequirementsForUserQuery, useRequirementsQuery } from '@/entities/rank-requirement';
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

  const techProgressQuery = useProgressListQuery('technique');
  const patProgressQuery = useProgressListQuery('pattern');

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
