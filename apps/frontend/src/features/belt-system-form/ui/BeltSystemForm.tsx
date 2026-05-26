import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateBeltSystemSchema,
  type BeltSystem,
} from '@repo/contracts/belt-systems';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { useCreateBeltSystem, useUpdateBeltSystem } from '@/entities/belt-system';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
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
type BeltSystemFormValues = z.input<typeof CreateBeltSystemSchema>;

export interface BeltSystemFormProps {
  /** Pre-populated row when editing; omitted when creating. */
  system?: BeltSystem;
  /** Fired after a successful save. The hub page closes the inline form / refetches. */
  onSaved?: () => void;
  /** Fired when the user cancels. The hub page hides the form. */
  onCancel?: () => void;
}

const NONE_ORG = '__none__';

export function BeltSystemForm({
  system,
  onSaved,
  onCancel,
}: BeltSystemFormProps): React.ReactElement {
  const { t } = useTranslation();
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  const form = useForm<BeltSystemFormValues>({
    resolver: zodResolver(CreateBeltSystemSchema),
    defaultValues: {
      code: system?.code ?? '',
      nameEn: system?.nameEn ?? '',
      nameSv: system?.nameSv ?? '',
      nameFi: system?.nameFi ?? '',
      organisationId: system?.organisationId ?? null,
      sortOrder: system?.sortOrder ?? 0,
    },
  });

  const create = useCreateBeltSystem();
  const update = useUpdateBeltSystem();
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    // zodResolver validates and transforms, so values here satisfy the output schema.
    // We cast to the parsed output type to satisfy the mutation's expected input shape.
    const parsed = CreateBeltSystemSchema.parse(values);
    try {
      if (system) {
        await update.mutateAsync({ id: system.id, input: parsed });
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
  const orgs = orgsQuery.data?.data ?? [];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="bs-code">{t('admin.beltCatalog.fields.code')}</Label>
        <Input id="bs-code" maxLength={3} {...form.register('code')} />
        <FormMessage message={form.formState.errors.code?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-name-en">{t('admin.beltCatalog.fields.nameEn')}</Label>
        <Input id="bs-name-en" {...form.register('nameEn')} />
        <FormMessage message={form.formState.errors.nameEn?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-name-sv">{t('admin.beltCatalog.fields.nameSv')}</Label>
        <Input id="bs-name-sv" {...form.register('nameSv')} />
        <FormMessage message={form.formState.errors.nameSv?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-name-fi">{t('admin.beltCatalog.fields.nameFi')}</Label>
        <Input id="bs-name-fi" {...form.register('nameFi')} />
        <FormMessage message={form.formState.errors.nameFi?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-org">{t('admin.beltCatalog.fields.organisation')}</Label>
        <Select
          value={form.watch('organisationId') ?? NONE_ORG}
          onValueChange={(v) => form.setValue('organisationId', v === NONE_ORG ? null : v)}
        >
          <SelectTrigger id="bs-org" aria-label={t('admin.beltCatalog.fields.organisation')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_ORG}>{t('admin.beltCatalog.organisationGlobal')}</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nameEn} ({o.shortCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField>
        <Label htmlFor="bs-sort">{t('admin.beltCatalog.fields.sortOrder')}</Label>
        <Input
          id="bs-sort"
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
