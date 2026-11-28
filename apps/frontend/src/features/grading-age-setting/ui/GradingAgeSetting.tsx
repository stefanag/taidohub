import { GRADING_AGE_BASES, type GradingAgeBasis } from '@repo/contracts/grading-age';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useUpdateOrganisation, type Organisation } from '@/entities/organisation';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

/**
 * For a national federation's orgadmin: how age is counted for grading
 * requirements in every club of the federation. Renders nothing for other
 * organisation types.
 */
export function GradingAgeSetting({
  organisation,
}: {
  organisation: Organisation;
}): React.ReactElement | null {
  const { t } = useTranslation();
  const update = useUpdateOrganisation();
  const current = organisation.gradingAgeBasis ?? 'age_on_grading_date';
  const [value, setValue] = React.useState<GradingAgeBasis>(current);
  const [status, setStatus] = React.useState<'idle' | 'saved' | 'error'>('idle');

  if (organisation.type !== 'national_federation') return null;

  const onSave = () => {
    setStatus('idle');
    update.mutate(
      { id: organisation.id, input: { gradingAgeBasis: value } },
      { onSuccess: () => setStatus('saved'), onError: () => setStatus('error') },
    );
  };

  return (
    <section className="mt-8 space-y-3" aria-labelledby={`grading-age-${organisation.id}`}>
      <h2 id={`grading-age-${organisation.id}`} className="text-lg font-semibold tracking-tight">
        {t('gradingAge.title')}
      </h2>
      <p className="max-w-2xl text-sm text-on-surface-variant">{t('gradingAge.intro')}</p>
      <div className="max-w-md space-y-1">
        <Label htmlFor={`grading-age-basis-${organisation.id}`}>{t('gradingAge.label')}</Label>
        <Select value={value} onValueChange={(v) => setValue(v as GradingAgeBasis)}>
          <SelectTrigger id={`grading-age-basis-${organisation.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRADING_AGE_BASES.map((b) => (
              <SelectItem key={b} value={b}>
                {t(`gradingAge.bases.${b}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-on-surface-variant">{t(`gradingAge.hints.${value}`)}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={update.isPending || value === current}
          onClick={onSave}
        >
          {t('common.save')}
        </Button>
        {status === 'saved' ? (
          <span className="text-sm text-on-surface-variant">{t('gradingAge.saved')}</span>
        ) : null}
        {status === 'error' ? (
          <span role="alert" className="text-sm text-destructive">
            {t('common.unknownError')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
