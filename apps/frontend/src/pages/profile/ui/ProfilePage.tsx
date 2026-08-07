import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/entities/me';
import { myProfileQueryOptions } from '@/entities/profile';
import { currentRank, useUserStatsQuery, useUserTrendsQuery } from '@/entities/statistic';
import { authClient } from '@/features/auth-by-email';
import { CoverageMeter } from '@/features/coverage-meter';
import { ProfileForm } from '@/features/profile-form';
import { TrendSparkline } from '@/features/trend-sparkline';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

/**
 * "Your progression" section: a `CoverageMeter` for the caller's current
 * rank (the `coverageByRank` entry with the highest `rank.sortOrder`) plus a
 * 12-month `TrendSparkline` for that rank's content-coverage percentage.
 *
 * Hides itself entirely when the caller has no coverage data yet (e.g. a
 * brand-new account with no rank assigned) rather than showing an empty
 * meter. The sparkline additionally hides on its own — independent of the
 * meter — when the trend endpoint returns no points, since a fresh rank has
 * no history to plot yet but still has a current coverage pct worth showing.
 */
function ProgressionSection({ userId }: { userId: string }): React.ReactElement | null {
  const { t } = useTranslation();
  const statsQuery = useUserStatsQuery(userId);

  const rank = currentRank(statsQuery.data?.coverageByRank ?? []);

  const trendsQuery = useUserTrendsQuery(
    userId,
    {
      metric: 'content_coverage_pct',
      dimensionKey: rank?.rank.id ?? '',
      months: 12,
    },
    { enabled: !!rank },
  );

  if (!rank) return null;

  return (
    <Card className="mt-6 max-w-2xl">
      <CardHeader>
        <CardTitle>{t('profile.progression.heading', { defaultValue: 'Your progression' })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CoverageMeter label={rank.rank.nameEn} pct={rank.coveragePct} />
        {trendsQuery.data && trendsQuery.data.points.length > 0 ? (
          <TrendSparkline points={trendsQuery.data.points} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Self-service profile page — any signed-in user can view and edit their own
 * profile here.
 */
export function ProfilePage(): React.ReactElement {
  const { t } = useTranslation();
  const profileQuery = useQuery(myProfileQueryOptions());
  const session = useSession();
  const currentUserId = session.data?.user.id;

  return (
    <main className="container py-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {profileQuery.isPending ? (
            <p className="text-on-surface-variant">{t('common.loading')}</p>
          ) : profileQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {profileQuery.error instanceof Error
                ? profileQuery.error.message
                : t('common.unknownError')}
            </p>
          ) : (
            <ProfileForm
              profile={profileQuery.data}
              onSaved={() => {
                // Refetch the better-auth session so the sidebar picks up the
                // synced `user.name` without a reload.
                void authClient.getSession();
              }}
            />
          )}
        </CardContent>
      </Card>
      {currentUserId ? <ProgressionSection userId={currentUserId} /> : null}
    </main>
  );
}
