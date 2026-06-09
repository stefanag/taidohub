import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import { listShogoTitlesQueryOptions } from '@/entities/shogo-title';
import {
  useCreateRankHistory,
  useUpdateRankHistory,
  type GradingHistoryRow,
} from '@/entities/rank-history';

import { HttpError } from '@/shared/api';
import { rankLabel, type Lang } from '@/shared/lib/rank-label';
import {
  Button,
  Dialog,
  DialogContent,
  DatePicker,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

import {
  DateStringSchema,
  type CreateRankHistoryInput,
} from '@repo/contracts/rank-history';

/**
 * Form-layer schema: validates string fields with empty strings allowed for
 * optional fields. Empty strings are stripped to null in `valuesToInput` before
 * the wire payload is assembled. Using string-only values keeps the form state
 * simple and avoids zodResolver output-type mismatches.
 */
const RankHistoryFormSchema = z.object({
  rankId: z.string().uuid(),
  shogoTitle: z.string(),
  date: DateStringSchema,
  examinerName: z.string(),
  organisationName: z.string(),
  notes: z.string().max(5000),
});

type Mode = 'create' | 'edit';

export interface RankHistoryFormDialogProps {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user the entry is recorded for. Self-service passes the current user; admin passes the edited user. */
  subjectUserId: string;
  /** Required when `mode='edit'`. The row being edited. */
  entry?: GradingHistoryRow;
}

interface FormValues {
  rankId: string;
  shogoTitle: string;
  date: string;
  examinerName: string;
  organisationName: string;
  notes: string;
}

const EMPTY: FormValues = {
  rankId: '',
  shogoTitle: '',
  date: '',
  examinerName: '',
  organisationName: '',
  notes: '',
};

function entryToValues(entry: GradingHistoryRow | undefined): FormValues {
  if (!entry) return EMPTY;
  return {
    rankId: entry.rankId,
    shogoTitle: entry.shogoTitle ?? '',
    date: entry.date,
    examinerName: entry.examiner ?? '',
    organisationName: entry.organisationName ?? '',
    notes: entry.notes ?? '',
  };
}

/** Strip empty strings → null so the wire payload matches the Zod schema. */
function valuesToInput(values: FormValues): CreateRankHistoryInput {
  return {
    rankId: values.rankId,
    date: values.date,
    shogoTitle: values.shogoTitle ? values.shogoTitle : null,
    examinerName: values.examinerName ? values.examinerName : null,
    organisationName: values.organisationName ? values.organisationName : null,
    notes: values.notes ? values.notes : null,
  };
}

/**
 * Create/edit modal for external grading-history entries. Uses
 * `react-hook-form` + `zodResolver(CreateRankHistorySchema)`. Edit mode
 * seeds the form from the passed `entry` and submits a partial patch.
 *
 * When editing a verified row, an amber warning appears above the submit
 * button if any of `rankId` / `date` / `shogoTitle` is dirty — these are the
 * three fields the backend clears verification for (spec §5 rule 3).
 */
export function RankHistoryFormDialog({
  mode,
  open,
  onOpenChange,
  subjectUserId,
  entry,
}: RankHistoryFormDialogProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Lang) ?? 'en';

  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const shogoQuery = useQuery(listShogoTitlesQueryOptions());

  const defaultValues = React.useMemo(() => entryToValues(entry), [entry]);

  const form = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(RankHistoryFormSchema),
  });

  // Re-seed the form whenever `entry` changes (e.g. when the admin tab
  // switches subject between users).
  React.useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const createMutation = useCreateRankHistory({
    onSuccess: () => {
      setSubmitError(undefined);
      onOpenChange(false);
    },
    onError: (err) => setSubmitError(err instanceof Error ? err.message : String(err)),
  });
  const updateMutation = useUpdateRankHistory({
    onSuccess: () => {
      setSubmitError(undefined);
      onOpenChange(false);
    },
    onError: (err) => setSubmitError(err instanceof Error ? err.message : String(err)),
  });

  // Sort ranks for the Select (global sortOrder ASC).
  const sortedRanks = React.useMemo(
    () => [...(ranksQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [ranksQuery.data],
  );
  const sortedShogo = React.useMemo(
    () => [...(shogoQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [shogoQuery.data],
  );

  // RHF watch — used both for dirty-detection on verified rows and for
  // disabling the submit button on missing required fields.
  const watched = form.watch();
  const dirtyFields = form.formState.dirtyFields;
  const isVerifiedEdit = mode === 'edit' && entry?.verified === true;
  const dirtyContentChanged =
    Boolean(dirtyFields.rankId) || Boolean(dirtyFields.date) || Boolean(dirtyFields.shogoTitle);
  const showWarning = isVerifiedEdit && dirtyContentChanged;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    const input = valuesToInput(values);
    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({ subjectUserId, input });
      } else if (entry) {
        await updateMutation.mutateAsync({ id: entry.id, subjectUserId, input });
      }
    } catch (err) {
      if (err instanceof HttpError) {
        setSubmitError(err.payload.message || err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError(t('common.unknownError'));
      }
    }
  });

  const title =
    mode === 'edit'
      ? t('gradingHistory.form.editTitle', { defaultValue: 'Edit past grading' })
      : t('gradingHistory.form.createTitle', { defaultValue: 'Add past grading' });

  const verifierName = entry?.verifiedBy?.name ?? '';
  const verifierDate = entry?.verifiedAt?.slice(0, 10) ?? '';
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {showWarning ? (
            <div className="rounded-sm border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('gradingHistory.form.clearsVerification', {
                name: verifierName,
                date: verifierDate,
                defaultValue: `Saving clears the verification by ${verifierName} on ${verifierDate}.`,
              })}
            </div>
          ) : null}

          <FormField>
            <Label htmlFor="rh-rank">
              {t('gradingHistory.form.rank', { defaultValue: 'Rank' })}
            </Label>
            <Select
              value={watched.rankId}
              onValueChange={(v) => form.setValue('rankId', v, { shouldDirty: true })}
            >
              <SelectTrigger
                id="rh-rank"
                aria-label={t('gradingHistory.form.rank', { defaultValue: 'Rank' })}
              >
                <SelectValue
                  placeholder={t('gradingHistory.form.rankPlaceholder', { defaultValue: 'Select…' })}
                />
              </SelectTrigger>
              <SelectContent>
                {sortedRanks.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {rankLabel(
                      {
                        nameRomaji: r.nameRomaji,
                        nameEn: r.nameEn,
                        nameSv: r.nameSv,
                        nameFi: r.nameFi,
                      },
                      lang,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage message={form.formState.errors.rankId?.message} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-shogo">
              {t('gradingHistory.form.shogoTitle', { defaultValue: 'Shogo title (optional)' })}
            </Label>
            <Select
              value={watched.shogoTitle || '__none__'}
              onValueChange={(v) =>
                form.setValue('shogoTitle', v === '__none__' ? '' : v, { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="rh-shogo"
                aria-label={t('gradingHistory.form.shogoTitle', {
                  defaultValue: 'Shogo title (optional)',
                })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t('gradingHistory.form.shogoNone', { defaultValue: 'None' })}
                </SelectItem>
                {sortedShogo.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {(
                      { en: s.nameEn, sv: s.nameSv, fi: s.nameFi } as Record<string, string>
                    )[lang] || s.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="rh-date">
              {t('gradingHistory.form.date', { defaultValue: 'Date' })}
            </Label>
            <DatePicker
              id="rh-date"
              value={form.watch('date')}
              onChange={(next) => form.setValue('date', next, { shouldDirty: true, shouldValidate: true })}
              aria-label={t('gradingHistory.form.date', { defaultValue: 'Date' })}
            />
            <FormMessage message={form.formState.errors.date?.message} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-examiner">
              {t('gradingHistory.form.examinerName', { defaultValue: 'Examiner' })}
            </Label>
            <Input id="rh-examiner" {...form.register('examinerName')} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-org">
              {t('gradingHistory.form.organisationName', { defaultValue: 'Organisation' })}
            </Label>
            <Input id="rh-org" {...form.register('organisationName')} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-notes">
              {t('gradingHistory.form.notes', { defaultValue: 'Notes' })}
            </Label>
            <textarea
              id="rh-notes"
              rows={3}
              className="w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              aria-label={t('gradingHistory.form.notes', { defaultValue: 'Notes' })}
              {...form.register('notes')}
            />
            <FormMessage message={form.formState.errors.notes?.message} />
          </FormField>

          <FormMessage message={submitError} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !watched.rankId || !watched.date}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
