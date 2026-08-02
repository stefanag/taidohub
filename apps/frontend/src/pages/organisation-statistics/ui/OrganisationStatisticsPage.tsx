import { useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  displayName,
  useOrganisationChildrenQuery,
  useOrganisationQuery,
} from '@/entities/organisation';
import { useOrganisationStatsQuery, useOrganisationTrendsQuery } from '@/entities/statistics';
import { RankBreakdown } from '@/features/rank-breakdown';
import { StatTile } from '@/features/stat-tile';
import { TrendSparkline } from '@/features/trend-sparkline';
import { HttpError } from '@/shared/api';

/**
 * Renders the ancestor chain (root -> ... -> immediate parent) for the
 * breadcrumb above the org header, oldest first. Implemented as a
 * self-recursing component rather than a client-side loop so each level is
 * an independent `useOrganisationQuery` call — the number of ancestors
 * isn't known up front, so a fixed number of hooks in the parent component
 * won't work, and recursion via composition keeps the hook count per
 * component instance constant (one `useOrganisationQuery` call each).
 *
 * Renders nothing while its own org is loading/erroring; the chain simply
 * grows in as each level resolves rather than blocking on the whole chain.
 */
function AncestorCrumbs({ parentId }: { parentId: string }): React.ReactElement | null {
  const { i18n } = useTranslation();
  const { data: parent } = useOrganisationQuery(parentId);

  if (!parent) return null;

  return (
    <>
      {parent.parentId ? <AncestorCrumbs parentId={parent.parentId} /> : null}
      <a href={`/organisation/${parent.id}/statistics`} className="text-primary hover:underline">
        {displayName(parent, i18n.language)}
      </a>
      <span aria-hidden="true" className="mx-1 text-on-surface-variant">
        &rsaquo;
      </span>
    </>
  );
}

/**
 * Org-scope statistics page, mounted at `/organisation/:id/statistics`.
 * Visible to sysadmins and to anyone with `manage Organisation` on `:id` —
 * that's enforced entirely by the backend (both the org and stats queries
 * 403 for callers without access), so this component has no client-side
 * role guard; it just renders whatever the queries return, including the
 * forbidden case.
 *
 * Layout: org name header + ancestor breadcrumb, the same four `StatTile`s
 * as the platform-wide admin statistics page, a `RankBreakdown`, a 12-month
 * `TrendSparkline` for student membership, and a drill-down list of direct
 * child organisations.
 */
export function OrganisationStatisticsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const { id } = useParams({ from: '/_app/organisation/$id/statistics' });

  const orgQuery = useOrganisationQuery(id);
  const statsQuery = useOrganisationStatsQuery(id);
  const trendsQuery = useOrganisationTrendsQuery(id, {
    metric: 'membershipCount',
    dimensionKey: 'student',
    months: 12,
  });
  const childrenQuery = useOrganisationChildrenQuery(id);

  const org = orgQuery.data;
  const children = childrenQuery.data?.data ?? [];

  const forbidden =
    (orgQuery.isError && orgQuery.error instanceof HttpError && orgQuery.error.status === 403) ||
    (statsQuery.isError &&
      statsQuery.error instanceof HttpError &&
      statsQuery.error.status === 403);

  if (forbidden) {
    return (
      <main className="container py-8">
        <p role="alert" className="text-sm text-destructive">
          {t('organisation.statistics.errors.forbidden', {
            defaultValue: "You don't have access to this organisation's statistics.",
          })}
        </p>
      </main>
    );
  }

  return (
    <main className="container py-8">
      <header>
        {orgQuery.isLoading ? (
          <div
            className="h-8 w-64 animate-pulse rounded bg-surface-container-high"
            aria-hidden="true"
          />
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">
            {org ? displayName(org, i18n.language) : id}
          </h1>
        )}

        {org?.parentId ? (
          <nav
            aria-label={t('organisation.statistics.breadcrumbLabel', {
              defaultValue: 'Ancestors',
            })}
            className="mt-1 flex flex-wrap items-center gap-1 text-sm text-on-surface-variant"
          >
            <AncestorCrumbs parentId={org.parentId} />
            <span className="font-medium text-on-surface">{displayName(org, i18n.language)}</span>
          </nav>
        ) : null}
      </header>

      {statsQuery.isLoading ? (
        <p className="mt-6 text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : statsQuery.isError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {statsQuery.error instanceof Error
            ? statsQuery.error.message
            : t('common.unknownError', { defaultValue: 'Unknown error' })}
        </p>
      ) : statsQuery.data ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={t('organisation.statistics.tiles.students', { defaultValue: 'Students' })}
              value={statsQuery.data.metrics.membershipCount.student}
            />
            <StatTile
              label={t('organisation.statistics.tiles.instructors', {
                defaultValue: 'Instructors',
              })}
              value={statsQuery.data.metrics.membershipCount.instructor}
            />
            <StatTile
              label={t('organisation.statistics.tiles.activeUsers30d', {
                defaultValue: 'Active users (30d)',
              })}
              value={statsQuery.data.metrics.activeUsersLast30Days}
            />
            <StatTile
              label={t('organisation.statistics.tiles.gradingsMtd', {
                defaultValue: 'Gradings this month',
              })}
              value={statsQuery.data.metrics.gradingEventsMonthToDate}
            />
          </div>

          <h2 className="mt-8 text-lg font-semibold tracking-tight">
            {t('organisation.statistics.ranksHeading', {
              defaultValue: 'Belts in this organisation',
            })}
          </h2>
          <div className="mt-4">
            <RankBreakdown ranks={statsQuery.data.ranks} />
          </div>

          <h2 className="mt-8 text-lg font-semibold tracking-tight">
            {t('organisation.statistics.trendLabel', {
              defaultValue: 'Students, last 12 months',
            })}
          </h2>
          <div className="mt-4">
            {trendsQuery.data ? <TrendSparkline points={trendsQuery.data.points} /> : null}
          </div>
        </>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">
          {t('organisation.statistics.childrenHeading', {
            defaultValue: 'Child organisations',
          })}
        </h2>
        {childrenQuery.isLoading ? (
          <p className="mt-2 text-on-surface-variant">
            {t('common.loading', { defaultValue: 'Loading…' })}
          </p>
        ) : children.length === 0 ? (
          <p className="mt-2 text-on-surface-variant">
            {t('organisation.statistics.noChildren', {
              defaultValue: 'No child organisations.',
            })}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {children.map((child) => (
              <li key={child.id}>
                <a
                  href={`/organisation/${child.id}/statistics`}
                  className="text-primary hover:underline"
                >
                  {displayName(child, i18n.language)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
