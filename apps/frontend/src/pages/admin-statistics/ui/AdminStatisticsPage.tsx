import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { usePlatformStatsQuery, useRebuildStatsMutation } from '@/entities/statistic';
import { RankBreakdown } from '@/features/rank-breakdown';
import { StatTile } from '@/features/stat-tile';
import { Button } from '@/shared/ui';

/**
 * Sysadmin-only platform statistics overview.
 *
 * Renders four headline `StatTile`s (student/instructor counts, active users
 * in the last 30 days, gradings month-to-date), the platform-wide rank
 * breakdown, and a manual "rebuild statistics" action for when the nightly
 * rollup job needs to be re-run on demand.
 *
 * i18n keys live under `admin.statistics.*`; every `t()` call carries a
 * `defaultValue` so the page renders sensible English copy even if a locale
 * bundle is missing a key (mirrors `admin-users`/`admin-feature-flags`).
 */
export function AdminStatisticsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const { data, isLoading, isError, error } = usePlatformStatsQuery();
  const rebuildMut = useRebuildStatsMutation();

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('admin.statistics.title', { defaultValue: 'Statistics' })}
      </h1>

      {isLoading ? (
        <p className="mt-6 text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : isError ? (
        <p className="mt-6 text-error">
          {error instanceof Error
            ? error.message
            : t('common.unknownError', { defaultValue: 'Unknown error' })}
        </p>
      ) : data ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={t('admin.statistics.tiles.students', { defaultValue: 'Students' })}
              value={data.metrics.membershipCount.student}
              locale={locale}
            />
            <StatTile
              label={t('admin.statistics.tiles.instructors', { defaultValue: 'Instructors' })}
              value={data.metrics.membershipCount.instructor}
              locale={locale}
            />
            <StatTile
              label={t('admin.statistics.tiles.activeUsers30d', {
                defaultValue: 'Active users (30d)',
              })}
              value={data.metrics.activeUsersLast30Days}
              locale={locale}
            />
            <StatTile
              label={t('admin.statistics.tiles.gradingsMtd', {
                defaultValue: 'Gradings this month',
              })}
              value={data.metrics.gradingEventsMonthToDate}
              locale={locale}
            />
          </div>

          <h2 className="mt-8 text-lg font-semibold tracking-tight">
            {t('admin.statistics.ranksHeading', { defaultValue: 'Belts across the platform' })}
          </h2>
          <div className="mt-4">
            <RankBreakdown ranks={data.ranks} />
          </div>

          <div className="mt-8 flex items-center gap-3">
            <Button onClick={() => rebuildMut.mutate()} disabled={rebuildMut.isPending}>
              {rebuildMut.isPending
                ? t('admin.statistics.rebuilding', { defaultValue: 'Rebuilding…' })
                : t('admin.statistics.rebuild', { defaultValue: 'Rebuild statistics' })}
            </Button>
            {rebuildMut.isSuccess ? (
              <span className="text-sm text-on-surface-variant">
                {t('admin.statistics.rebuiltIn', {
                  defaultValue: 'Rebuilt in {{durationMs}}ms',
                  durationMs: rebuildMut.data.durationMs,
                })}
              </span>
            ) : null}
            {rebuildMut.isError ? (
              <span className="text-sm text-error">
                {rebuildMut.error instanceof Error
                  ? rebuildMut.error.message
                  : t('common.unknownError', { defaultValue: 'Unknown error' })}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
