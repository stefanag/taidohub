import { useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ContentType, Progress } from '@repo/contracts/progress';

import { usePatternsQuery } from '@/entities/pattern';
import { useStudentProgressQuery, useStudentsQuery } from '@/entities/student';
import { useTechniquesQuery } from '@/entities/technique';
import { FeedbackThread, FeedbackThreadSheet } from '@/features/feedback-thread';
import { StudentProgressEditorDialog } from '@/features/student-progress-editor-dialog';
import { HttpError } from '@/shared/api';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { ProgressPill } from '@/shared/ui';

/**
 * Instructor view of a single student's progress. Two sections — Techniques
 * and Patterns — each rendering the full catalogue with a `<ProgressPill>`
 * per row. Clicking a pill opens `<StudentProgressEditorDialog>` for that
 * row.
 *
 * Forbidden (403) — the student is not in any of the instructor's orgs — is
 * rendered as a friendly inline message instead of a stack trace.
 */
export function StudentDetailPage(): React.ReactElement {
  const { t } = useTranslation();
  const { userId } = useParams({ strict: false }) as { userId: string };
  const feedbackEnabled = useFeatureFlag('instructor-feedback');

  const techniquesQ = useTechniquesQuery([]);
  const patternsQ = usePatternsQuery([]);
  const progressQ = useStudentProgressQuery(userId);
  const studentsQ = useStudentsQuery();

  const student = React.useMemo(
    () => studentsQ.data?.find((s) => s.userId === userId),
    [studentsQ.data, userId],
  );

  const techniques = techniquesQ.data ?? [];
  const patterns = patternsQ.data ?? [];
  const progressRows = progressQ.data ?? [];

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

      {feedbackEnabled ? (
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
      ) : null}

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
