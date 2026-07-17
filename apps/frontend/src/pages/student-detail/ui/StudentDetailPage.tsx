import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ContentType, Progress } from '@repo/contracts/progress';

import { listBeltRanksQueryOptions, type BeltRank } from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import { usePatternsQuery } from '@/entities/pattern';
import {
  gradingHistoryQueryOptions,
  useUnverifyRankHistory,
  useVerifyRankHistory,
} from '@/entities/rank-history';
import { useRequirementsForUserQuery } from '@/entities/rank-requirement';
import { listShogoTitlesQueryOptions, type ShogoTitle } from '@/entities/shogo-title';
import { useStudentProgressQuery, useStudentsQuery } from '@/entities/student';
import { useTechniquesQuery } from '@/entities/technique';
import { FeedbackThread, FeedbackThreadSheet } from '@/features/feedback-thread';
import { GradingTimeline } from '@/features/grading-timeline';
import { NextRankCard, useNextRank } from '@/features/next-rank-card';
import { RankRequirementsDisplay } from '@/features/rank-requirements-display';
import { StudentProgressEditorDialog } from '@/features/student-progress-editor-dialog';
import { HttpError } from '@/shared/api';
import { FeatureFlag } from '@/shared/lib/feature-flags';
import { ProgressPill } from '@/shared/ui';

/**
 * Instructor view of a single student's progress. Leads with `<NextRankCard
 * userId={studentId} />` and, once the student's next rank and its resolved
 * requirements are known, a `<RankRequirementsDisplay />` section — both
 * driven by the *student's* progress (`useStudentProgressQuery`), not the
 * instructor's own (Task 22 cross-user fix, Task 25). Below that, two
 * sections — Techniques and Patterns — each rendering the full catalogue
 * with a `<ProgressPill>` per row. Clicking a pill opens
 * `<StudentProgressEditorDialog>` for that row.
 *
 * Forbidden (403) — the student is not in any of the instructor's orgs — is
 * rendered as a friendly inline message instead of a stack trace.
 */
export function StudentDetailPage(): React.ReactElement {
  const { t } = useTranslation();
  const { userId } = useParams({ strict: false }) as { userId: string };

  const techniquesQ = useTechniquesQuery([]);
  const patternsQ = usePatternsQuery([]);
  const progressQ = useStudentProgressQuery(userId);
  const studentsQ = useStudentsQuery();
  const gradingHistoryQ = useQuery(gradingHistoryQueryOptions(userId));
  const ranksQ = useQuery(listBeltRanksQueryOptions());
  const systemsQ = useQuery(listBeltSystemsQueryOptions());
  const shogoQ = useQuery(listShogoTitlesQueryOptions());
  const verifyMut = useVerifyRankHistory();
  const unverifyMut = useUnverifyRankHistory();

  const { nextRank } = useNextRank(userId);
  const requirementsQ = useRequirementsForUserQuery(nextRank?.id ?? null, userId);

  const rankMap = React.useMemo(() => {
    const m = new Map<string, BeltRank>();
    for (const r of ranksQ.data ?? []) m.set(r.id, r);
    return m;
  }, [ranksQ.data]);
  const systemCodeMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of systemsQ.data ?? []) m.set(s.id, s.code);
    return m;
  }, [systemsQ.data]);
  const shogoTitleMap = React.useMemo(() => {
    const m = new Map<string, ShogoTitle>();
    for (const s of shogoQ.data ?? []) m.set(s.code, s);
    return m;
  }, [shogoQ.data]);

  const gradingEntries = gradingHistoryQ.data?.data ?? [];

  /**
   * When the URL hash points at a grading row (#grading-<id>), scroll
   * to it once the timeline has rendered. The bell-icon inbox uses
   * this hash so an instructor can jump from "unread grading
   * feedback" straight to the right row.
   */
  React.useEffect(() => {
    if (gradingHistoryQ.isPending) return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash.startsWith('grading-')) return;
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [gradingHistoryQ.isPending, gradingHistoryQ.data]);

  const student = React.useMemo(
    () => studentsQ.data?.find((s) => s.userId === userId),
    [studentsQ.data, userId],
  );

  const techniques = React.useMemo(() => techniquesQ.data ?? [], [techniquesQ.data]);
  const patterns = React.useMemo(() => patternsQ.data ?? [], [patternsQ.data]);
  const progressRows = React.useMemo(() => progressQ.data ?? [], [progressQ.data]);

  const progressByTechniqueId = React.useMemo(() => {
    const m = new Map<string, Progress>();
    for (const p of progressRows) {
      if (p.contentType === 'technique' && p.techniqueId) {
        m.set(p.techniqueId, p);
      }
    }
    return m;
  }, [progressRows]);

  const progressByPatternId = React.useMemo(() => {
    const m = new Map<string, Progress>();
    for (const p of progressRows) {
      if (p.contentType === 'pattern' && p.patternId) {
        m.set(p.patternId, p);
      }
    }
    return m;
  }, [progressRows]);

  const techProgressRows = React.useMemo(
    () => progressRows.filter((p) => p.contentType === 'technique'),
    [progressRows],
  );
  const patProgressRows = React.useMemo(
    () => progressRows.filter((p) => p.contentType === 'pattern'),
    [progressRows],
  );

  const requirementsLookup = React.useMemo(() => {
    const techniqueMap = new Map(techniques.map((t) => [t.id, t]));
    const patternMap = new Map(patterns.map((p) => [p.id, p]));
    return { techniques: techniqueMap, patterns: patternMap };
  }, [techniques, patterns]);

  const [editing, setEditing] = React.useState<{
    contentType: ContentType;
    contentId: string;
    label: string;
  } | null>(null);

  if (
    progressQ.isError &&
    progressQ.error instanceof HttpError &&
    progressQ.error.status === 403
  ) {
    return (
      <main className="container py-8">
        <p role="alert" className="text-sm text-destructive">
          {t('students.errors.forbidden')}
        </p>
      </main>
    );
  }

  const headerLabel = student?.name ?? student?.email ?? userId;

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{headerLabel}</h1>
      <p className="mt-2 text-on-surface-variant">
        {student?.email && student.name ? student.email : null}
      </p>

      <section className="mt-8">
        <NextRankCard userId={userId} />
      </section>

      {nextRank && requirementsQ.data ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('students.detail.requirements')}</h2>
          <div className="mt-4">
            <RankRequirementsDisplay
              requirements={requirementsQ.data}
              techProgress={techProgressRows}
              patProgress={patProgressRows}
              lookup={requirementsLookup}
            />
          </div>
        </section>
      ) : null}

      <FeatureFlag code="instructor-feedback">
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('feedback.title')}</h2>
          <div className="mt-4 rounded-md border border-outline-variant/40 p-4">
            <FeedbackThread
              entityType="general"
              entityId={userId}
              studentId={userId}
            />
          </div>
        </section>
      </FeatureFlag>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          {t('students.detail.techniques')}
        </h2>
        {techniquesQ.isPending ? (
          <p className="mt-2">{t('common.loading')}</p>
        ) : techniques.length === 0 ? (
          <p className="mt-2 text-on-surface-variant">{t('techniques.empty')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {techniques.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-lg border border-outline-variant p-3"
              >
                <span className="font-medium">{row.nameRomaji}</span>
                <div className="ml-auto flex items-center gap-2">
                  <FeedbackThreadSheet
                    entityType="technique"
                    entityId={row.id}
                    studentId={userId}
                    contextLabel={`${headerLabel} · ${row.nameRomaji}`}
                  />
                  <ProgressPill
                    status={progressByTechniqueId.get(row.id)?.status ?? null}
                    onClick={() =>
                      setEditing({
                        contentType: 'technique',
                        contentId: row.id,
                        label: row.nameRomaji,
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          {t('students.detail.patterns')}
        </h2>
        {patternsQ.isPending ? (
          <p className="mt-2">{t('common.loading')}</p>
        ) : patterns.length === 0 ? (
          <p className="mt-2 text-on-surface-variant">{t('patterns.empty')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {patterns.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-lg border border-outline-variant p-3"
              >
                <span className="font-medium">{row.nameRomaji}</span>
                <div className="ml-auto flex items-center gap-2">
                  <FeedbackThreadSheet
                    entityType="pattern"
                    entityId={row.id}
                    studentId={userId}
                    contextLabel={`${headerLabel} · ${row.nameRomaji}`}
                  />
                  <ProgressPill
                    status={progressByPatternId.get(row.id)?.status ?? null}
                    onClick={() =>
                      setEditing({
                        contentType: 'pattern',
                        contentId: row.id,
                        label: row.nameRomaji,
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          {t('gradingHistory.title', { defaultValue: 'Grading history' })}
        </h2>
        {gradingHistoryQ.isPending ? (
          <p className="mt-2">{t('common.loading')}</p>
        ) : gradingHistoryQ.isError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {gradingHistoryQ.error instanceof Error
              ? gradingHistoryQ.error.message
              : t('common.unknownError')}
          </p>
        ) : (
          <div className="mt-4">
            <GradingTimeline
              entries={gradingEntries}
              rankMap={rankMap}
              systemCodeMap={systemCodeMap}
              shogoTitleMap={shogoTitleMap}
              subjectUserId={userId}
              onVerify={(id) => verifyMut.mutate({ id, subjectUserId: userId })}
              onUnverify={(id) => unverifyMut.mutate({ id, subjectUserId: userId })}
            />
          </div>
        )}
      </section>

      {editing ? (
        <StudentProgressEditorDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          studentUserId={userId}
          contentType={editing.contentType}
          contentId={editing.contentId}
          contentLabel={editing.label}
        />
      ) : null}
    </main>
  );
}
