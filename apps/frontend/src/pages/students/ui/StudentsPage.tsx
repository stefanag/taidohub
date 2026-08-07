import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { currentRank, useUserStatsQuery } from '@/entities/statistic';
import { useStudentsQuery } from '@/entities/student';
import { CoverageMeter } from '@/features/coverage-meter';
import { Badge } from '@/shared/ui';

/**
 * Compact per-row coverage indicator for the instructor roster. Fires its
 * own `useUserStatsQuery(userId)` — one query per row is chatty at scale,
 * but acceptable for the class sizes this page targets today (MVP; revisit
 * with a batched endpoint if roster sizes grow).
 *
 * Renders nothing (not even a placeholder) once loaded with no coverage
 * data — a student with no rank assigned yet has nothing meaningful to show
 * in this slot.
 */
function StudentCoverageCell({ userId }: { userId: string }): React.ReactElement | null {
  const statsQuery = useUserStatsQuery(userId);

  const rank = currentRank(statsQuery.data?.coverageByRank ?? []);

  if (statsQuery.isLoading) return null;
  if (!rank) return null;

  return <CoverageMeter label={rank.rank.nameEn} pct={rank.coveragePct} />;
}

/**
 * Instructor-facing student roster. Columns: name → link to detail page,
 * email, organisations (joined), four progress-status count chips
 * (not_started / learning / competent / grading_ready), current-rank
 * coverage meter.
 *
 * Data comes from `useStudentsQuery()` — already scoped server-side to
 * students the calling instructor is allowed to see (or every student for
 * sysadmins). Empty state: `t('students.empty')`.
 */
export function StudentsPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: students = [], isPending } = useStudentsQuery();

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('students.title')}
      </h1>
      <p className="mt-2 max-w-2xl text-on-surface-variant">
        {t('students.description')}
      </p>

      <section className="mt-8">
        {isPending ? (
          <p>{t('common.loading')}</p>
        ) : students.length === 0 ? (
          <p>{t('students.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-on-surface-variant">
              <tr>
                <th className="px-2 py-2">{t('students.columns.name')}</th>
                <th className="px-2 py-2">{t('students.columns.email')}</th>
                <th className="px-2 py-2">
                  {t('students.columns.organisations')}
                </th>
                <th className="px-2 py-2">{t('students.columns.progress')}</th>
                <th className="px-2 py-2">{t('students.columns.coverage')}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.userId}
                  onClick={() =>
                    navigate({ to: '/students/$userId', params: { userId: s.userId } })
                  }
                  className="cursor-pointer border-b hover:bg-surface-container-low/50"
                >
                  <td className="px-2 py-2 font-medium">{s.name ?? s.email}</td>
                  <td className="px-2 py-2 text-on-surface-variant">{s.email}</td>
                  <td className="px-2 py-2 text-on-surface-variant">
                    {s.organisations.map((o) => o.name).join(', ')}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" title={t('students.summary.notStarted')}>
                        {t('students.summary.notStarted')}: {s.progressSummary.not_started}
                      </Badge>
                      <Badge
                        className="bg-primary-container text-on-primary-container"
                        title={t('students.summary.learning')}
                      >
                        {t('students.summary.learning')}: {s.progressSummary.learning}
                      </Badge>
                      <Badge
                        className="bg-secondary-container text-on-secondary-container"
                        title={t('students.summary.competent')}
                      >
                        {t('students.summary.competent')}: {s.progressSummary.competent}
                      </Badge>
                      <Badge
                        className="bg-tertiary-container text-on-tertiary-container"
                        title={t('students.summary.gradingReady')}
                      >
                        {t('students.summary.gradingReady')}: {s.progressSummary.grading_ready}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <StudentCoverageCell userId={s.userId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
