import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type {
  ContentType,
  ProgressStatus,
  UpsertProgressInput,
} from '@repo/contracts/progress';

import {
  useDeletePatternProgressMutation,
  useDeleteTechniqueProgressMutation,
  usePatternProgressQuery,
  useTechniqueProgressQuery,
  useUpsertPatternProgressMutation,
  useUpsertTechniqueProgressMutation,
} from '@/entities/progress';

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

export interface ProgressEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ContentType;
  contentId: string;
  /** Optional display label for the dialog title (e.g. technique nameRomaji). */
  contentLabel?: string;
}

/**
 * Edit-per-user-progress modal for a single technique or pattern row.
 *
 * One component handles both content types — branching on `contentType`
 * decides which query/mutation hook to consume. The dialog seeds its local
 * state from the matching `useTechniqueProgressQuery` / `usePatternProgressQuery`
 * row whenever it opens (or the underlying row id changes), and on submit
 * fires the matching upsert mutation and closes itself.
 *
 * The Reset button is only rendered when an existing row is loaded — its
 * purpose is to delete the row entirely, which is conceptually distinct from
 * "set status back to not_started". `window.confirm` gates the destructive
 * call so a misclick on the chip overlay can't silently wipe progress.
 *
 * Sizing mirrors the Phase 2 fix on `TechniqueFormDialog`
 * (`max-h-[85vh] grid-rows-[auto_minmax(0,1fr)]` on `DialogContent` +
 * `overflow-y-auto pr-1` on the form) so long notes scroll inside the body
 * instead of pushing the footer off-viewport.
 */
export function ProgressEditorDialog({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentLabel,
}: ProgressEditorDialogProps): React.ReactElement {
  const { t } = useTranslation();

  const techniqueQ = useTechniqueProgressQuery(
    contentType === 'technique' ? contentId : null,
  );
  const patternQ = usePatternProgressQuery(
    contentType === 'pattern' ? contentId : null,
  );
  const existing = contentType === 'technique' ? techniqueQ.data : patternQ.data;

  const [status, setStatus] = React.useState<ProgressStatus>(
    existing?.status ?? 'not_started',
  );
  const [studentNotes, setStudentNotes] = React.useState(existing?.studentNotes ?? '');
  const [lastPracticedAt, setLastPracticedAt] = React.useState<string>(
    existing?.lastPracticedAt ?? '',
  );

  // Reseed-on-open is now driven by the parent via
  // `key={\`${open ? 'open' : 'closed'}:${contentId}\`}` — a fresh mount
  // runs the useState initializers above with the current row's data.

  const upsertTech = useUpsertTechniqueProgressMutation();
  const upsertPat = useUpsertPatternProgressMutation();
  const deleteTech = useDeleteTechniqueProgressMutation();
  const deletePat = useDeletePatternProgressMutation();
  const pending =
    upsertTech.isPending ||
    upsertPat.isPending ||
    deleteTech.isPending ||
    deletePat.isPending;

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input: UpsertProgressInput = {
      status,
      studentNotes,
      lastPracticedAt: lastPracticedAt.trim() === '' ? null : lastPracticedAt,
    };
    if (contentType === 'technique') {
      upsertTech.mutate(
        { id: contentId, input },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      upsertPat.mutate(
        { id: contentId, input },
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
            <Label htmlFor="progress-status">
              {t('progress.status.label', { defaultValue: 'Status' })}
            </Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ProgressStatus)}
            >
              <SelectTrigger id="progress-status">
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
            <Label htmlFor="progress-student-notes">
              {t('progress.studentNotes', { defaultValue: 'Notes' })}
            </Label>
            <textarea
              id="progress-student-notes"
              value={studentNotes}
              onChange={(e) => setStudentNotes(e.target.value)}
              className={textareaClass}
              rows={4}
              maxLength={2000}
              aria-label={t('progress.studentNotes', { defaultValue: 'Notes' })}
            />
          </FormField>

          {existing?.instructorNotes ? (
            <FormField>
              <Label>
                {t('progress.instructorNotes', {
                  defaultValue: 'Instructor notes',
                })}
              </Label>
              <p className="rounded-sm border border-outline-variant/40 bg-surface-container px-3 py-2 text-sm whitespace-pre-wrap">
                {existing.instructorNotes}
              </p>
            </FormField>
          ) : null}

          <FormField>
            <Label htmlFor="progress-last-practiced">
              {t('progress.lastPracticed', { defaultValue: 'Last practiced' })}
            </Label>
            <DatePicker
              id="progress-last-practiced"
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
