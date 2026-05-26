import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateShogoTitleSchema,
  type ShogoTitle,
} from '@repo/contracts/shogo-titles';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import { useCreateShogoTitle, useUpdateShogoTitle } from '@/entities/shogo-title';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

/** Use the schema's input type so RHF sees optional/defaulted fields correctly. */
type ShogoTitleFormValues = z.input<typeof CreateShogoTitleSchema>;

export interface ShogoTitleFormProps {
  shogo?: ShogoTitle;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function ShogoTitleForm({
  shogo,
  onSaved,
  onCancel,
}: ShogoTitleFormProps): React.ReactElement {
  const { t } = useTranslation();
  const ranksQuery = useQuery(listBeltRanksQueryOptions());

  const form = useForm<ShogoTitleFormValues>({
    resolver: zodResolver(CreateShogoTitleSchema),
    defaultValues: {
      code: shogo?.code ?? '',
      nameEn: shogo?.nameEn ?? '',
      nameSv: shogo?.nameSv ?? '',
      nameFi: shogo?.nameFi ?? '',
      nameJa: shogo?.nameJa ?? '',
      minRankId: shogo?.minRankId ?? '',
      sortOrder: shogo?.sortOrder ?? 0,
    },
  });

  const create = useCreateShogoTitle();
  const update = useUpdateShogoTitle();
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    const parsed = CreateShogoTitleSchema.parse(values);
    try {
      if (shogo) {
        await update.mutateAsync({ code: shogo.code, input: parsed });
      } else {
        await create.mutateAsync(parsed);
      }
      onSaved?.();
    } catch (err) {
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    }
  });

  const pending = create.isPending || update.isPending;
  const ranks = ranksQuery.data ?? [];
  const editing = Boolean(shogo);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="sh-code">{t('admin.beltCatalog.fields.code')}</Label>
        <Input id="sh-code" disabled={editing} {...form.register('code')} />
        <FormMessage message={form.formState.errors.code?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="sh-en">{t('admin.beltCatalog.fields.nameEn')}</Label>
        <Input id="sh-en" {...form.register('nameEn')} />
      </FormField>
      <FormField>
        <Label htmlFor="sh-sv">{t('admin.beltCatalog.fields.nameSv')}</Label>
        <Input id="sh-sv" {...form.register('nameSv')} />
      </FormField>
      <FormField>
        <Label htmlFor="sh-fi">{t('admin.beltCatalog.fields.nameFi')}</Label>
        <Input id="sh-fi" {...form.register('nameFi')} />
      </FormField>
      <FormField>
        <Label htmlFor="sh-ja">{t('admin.beltCatalog.fields.nameJa')}</Label>
        <Input id="sh-ja" {...form.register('nameJa')} />
      </FormField>

      <FormField>
        <Label htmlFor="sh-rank">{t('admin.beltCatalog.fields.minRank')}</Label>
        <Select
          value={form.watch('minRankId') || ''}
          onValueChange={(v) => form.setValue('minRankId', v)}
        >
          <SelectTrigger id="sh-rank">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranks.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nameRomaji} (level {r.level})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage message={form.formState.errors.minRankId?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="sh-sort">{t('admin.beltCatalog.fields.sortOrder')}</Label>
        <Input
          id="sh-sort"
          type="number"
          {...form.register('sortOrder', { valueAsNumber: true })}
        />
      </FormField>

      <FormMessage message={submitError} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
