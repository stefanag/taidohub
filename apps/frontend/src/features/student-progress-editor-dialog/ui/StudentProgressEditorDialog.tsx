import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type {
  ContentType,
  Progress,
  ProgressStatus,
  UpsertInstructorProgressInput,
} from '@repo/contracts/progress';

import {
  useDeleteStudentPatternProgressMutation,
  useDeleteStudentTechniqueProgressMutation,
  useStudentProgressQuery,
  useUpsertStudentPatternProgressMutation,
  useUpsertStudentTechniqueProgressMutation,
} from '@/entities/student';

import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

const STATUS_VALUES: readonly ProgressStatus[] = [
  'not_started',
  'learning',
  'competent',
  'grading_ready',
];

const STATUS_KEY: Record<ProgressStatus, string> = {
  not_started: 'progress.status.notStarted',
  learning: 'progress.status.learning',
  competent: 'progress.status.competent',
  grading_ready: 'progress.status.gradingReady',
};

const textareaClass =
  'w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary';

export interface StudentProgressEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  contentType: ContentType;
  contentId: string;
  /** Optional display label for the dialog title (e.g. technique nameRomaji). */
  contentLabel?: string;
}

/**
 * Instructor-side mirror of `ProgressEditorDialog`: lets an instructor edit a
 * single student's progress row on a technique or pattern.
 *
 * Channel split is inverted vs. the student-facing dialog:
 * - `instructorNotes` is editable (writes through `UpsertInstructorProgressInput`).
 * - `studentNotes` is rendered read-only below, when present, so the instructor
 *   can read what the student wrote without overwriting it.
 *
 * Data comes from the per-student progress list (`useStudentProgressQuery`),
 * which already returns every row for the student; we filter locally for the
 * row matching `contentType` + `contentId`. Missing row → treated as create.
 *
 * Sizing/overflow mirrors `ProgressEditorDialog` so long notes scroll inside
 * the body and the footer stays pinned.
 */
export function StudentProgressEditorDialog({
  open,
  onOpenChange,
  studentUserId,
  contentType,
  contentId,
  contentLabel,
}: StudentProgressEditorDialogProps): React.ReactElement {
  const { t } = useTranslation();

  const progressQ = useStudentProgressQuery(open ? studentUserId : null);
  const existing: Progress | undefined = React.useMemo(() => {
    const rows = progressQ.data;
    if (!rows) return undefined;
    if (contentType === 'technique') {
      return rows.find(
        (r) => r.contentType === 'technique' && r.techniqueId === contentId,
      );
    }
    return rows.find(
      (r) => r.contentType === 'pattern' && r.patternId === contentId,
    );
  }, [progressQ.data, contentType, contentId]);

  const [status, setStatus] = React.useState<ProgressStatus>('not_started');
  const [instructorNotes, setInstructorNotes] = React.useState('');
  const [lastPracticedAt, setLastPracticedAt] = React.useState<string>('');

  // Reseed when the dialog opens with a new content row.
  React.useEffect(() => {
    if (!open) return;
    setStatus(existing?.status ?? 'not_started');
    setInstructorNotes(existing?.instructorNotes ?? '');
    setLastPracticedAt(existing?.lastPracticedAt ?? '');
  }, [
    open,
    existing?.id,
    existing?.status,
    existing?.instructorNotes,
    existing?.lastPracticedAt,
  ]);

  const upsertTech = useUpsertStudentTechniqueProgressMutation(studentUserId);
  const upsertPat = useUpsertStudentPatternProgressMutation(studentUserId);
  const deleteTech = useDeleteStudentTechniqueProgressMutation(studentUserId);
  const deletePat = useDeleteStudentPatternProgressMutation(studentUserId);
  const pending =
    upsertTech.isPending ||
    upsertPat.isPending ||
    deleteTech.isPending ||
    deletePat.isPending;

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input: UpsertInstructorProgressInput = {
      status,
      instructorNotes,
      lastPracticedAt: lastPracticedAt.trim() === '' ? null : lastPracticedAt,
    };
    if (contentType === 'technique') {
      upsertTech.mutate(
        { techniqueId: contentId, input },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      upsertPat.mutate(
        { patternId: contentId, input },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  const onReset = (): void => {
    if (
      !window.confirm(
        t('progress.resetConfirm', {
          defaultValue: 'Reset progress for this entry?',
        }),
      )
    ) {
      return;
    }
    const onSuccess = (): void => onOpenChange(false);
    if (contentType === 'technique') {
      deleteTech.mutate(contentId, { onSuccess });
    } else {
      deletePat.mutate(contentId, { onSuccess });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t('progress.title', { defaultValue: 'Progress' })}
            {contentLabel ? ` — ${contentLabel}` : ''}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 overflow-y-auto pr-1"
          noValidate
        >
          <FormField>
            <Label htmlFor="student-progress-status">
              {t('progress.status.label', { defaultValue: 'Status' })}
            </Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ProgressStatus)}
            >
              <SelectTrigger id="student-progress-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(STATUS_KEY[s], { defaultValue: s })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="student-progress-instructor-notes">
              {t('progress.instructorNotes', {
                defaultValue: 'Instructor notes',
              })}
            </Label>
            <textarea
              id="student-progress-instructor-notes"
              value={instructorNotes}
              onChange={(e) => setInstructorNotes(e.target.value)}
              className={textareaClass}
              rows={4}
              maxLength={2000}
              aria-label={t('progress.instructorNotes', {
                defaultValue: 'Instructor notes',
              })}
            />
          </FormField>

          {existing?.studentNotes ? (
            <FormField>
              <Label>
                {t('progress.studentNotes', { defaultValue: 'Student notes' })}
              </Label>
              <p className="rounded-sm border border-outline-variant/40 bg-surface-container px-3 py-2 text-sm whitespace-pre-wrap">
                {existing.studentNotes}
              </p>
            </FormField>
          ) : null}

          <FormField>
            <Label htmlFor="student-progress-last-practiced">
              {t('progress.lastPracticed', { defaultValue: 'Last practiced' })}
            </Label>
            <DatePicker
              id="student-progress-last-practiced"
              value={lastPracticedAt}
              onChange={(next) => setLastPracticedAt(next)}
              aria-label={t('progress.lastPracticed', {
                defaultValue: 'Last practiced',
              })}
            />
          </FormField>

          <DialogFooter className="mt-auto flex flex-wrap gap-2">
            {existing ? (
              <Button
                type="button"
                variant="outline"
                onClick={onReset}
                disabled={pending}
              >
                {t('progress.reset', { defaultValue: 'Reset' })}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('progress.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
