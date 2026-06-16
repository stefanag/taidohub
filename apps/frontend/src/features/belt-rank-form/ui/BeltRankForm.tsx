import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateBeltRankSchema,
  type BeltRank,
} from '@repo/contracts/ranks';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import {
  listBeltRanksQueryOptions,
  useCreateBeltRank,
  useUpdateBeltRank,
} from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import { HttpError } from '@/shared/api';
import { getBeltVisuals } from '@/shared/lib/belt-visuals';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';
import { BeltGraphic } from '@/shared/ui/belt-graphic';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

/** Use the schema's input type so RHF sees optional/defaulted fields correctly. */
type BeltRankFormValues = z.input<typeof CreateBeltRankSchema>;

export interface BeltRankFormProps {
  /** Pre-populated row when editing. */
  rank?: BeltRank;
  onSaved?: () => void;
  onCancel?: () => void;
}

const NONE = '__none__';

export function BeltRankForm({
  rank,
  onSaved,
  onCancel,
}: BeltRankFormProps): React.ReactElement {
  const { t } = useTranslation();
  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  const form = useForm<BeltRankFormValues>({
    resolver: zodResolver(CreateBeltRankSchema),
    defaultValues: {
      organisationId: rank?.organisationId ?? null,
      systemId: rank?.systemId ?? '',
      level: rank?.level ?? 1,
      sortOrder: rank?.sortOrder ?? 0,
      nameJa: rank?.nameJa ?? null,
      nameRomaji: rank?.nameRomaji ?? '',
      nameEn: rank?.nameEn ?? '',
      nameSv: rank?.nameSv ?? '',
      nameFi: rank?.nameFi ?? '',
      beltColor: rank?.beltColor ?? '#FFFFFF',
      imageUrl: rank?.imageUrl ?? null,
      descriptionEn: rank?.descriptionEn ?? null,
      descriptionSv: rank?.descriptionSv ?? null,
      descriptionFi: rank?.descriptionFi ?? null,
      publiclyVisible: rank?.publiclyVisible ?? false,
      slug: rank?.slug ?? null,
      minAge: rank?.minAge ?? null,
      nextRankId: rank?.nextRankId ?? null,
    },
  });

  const create = useCreateBeltRank();
  const update = useUpdateBeltRank();
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const pending = create.isPending || update.isPending;
  const systems = systemsQuery.data ?? [];
  const ranks = ranksQuery.data ?? [];
  const orgs = orgsQuery.data?.data ?? [];

  // Live preview for the BeltGraphic. When editing, we preserve the rank's
  // stored `visuals` (which may have been authored independently of the
  // procedural system+level mapping). Only for a brand-new rank do we fall
  // back to `getBeltVisuals` as a sensible default.
  const watchedSystemId = form.watch('systemId');
  const watchedLevel = form.watch('level');
  const watchedColor = form.watch('beltColor');
  const watchedPublic = form.watch('publiclyVisible');
  const watchedSystem = systems.find((s) => s.id === watchedSystemId);
  const visuals = rank?.visuals
    ?? (watchedSystem
      ? getBeltVisuals(watchedSystem.code, Number(watchedLevel ?? 0))
      : { gradient: 'white' as const });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    // Service-side guard against `nextRankId` self-reference for edit mode.
    if (rank && values.nextRankId === rank.id) {
      setSubmitError(t('admin.beltCatalog.errors.nextRankSelf'));
      return;
    }
    const parsed = CreateBeltRankSchema.parse({ ...values, visuals });
    try {
      if (rank) {
        await update.mutateAsync({ id: rank.id, input: parsed });
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

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="rounded border border-outline-variant p-3">
        <div className="mb-2 text-xs uppercase text-on-surface-variant">
          {t('admin.beltCatalog.preview')}
        </div>
        <BeltGraphic {...visuals} className="w-full max-w-xs" />
        <div
          className="mt-2 h-3 w-full max-w-xs rounded"
          style={{ backgroundColor: watchedColor ?? '#ffffff' }}
          aria-label={t('admin.beltCatalog.fields.beltColor')}
        />
      </div>

      <FormField>
        <Label htmlFor="br-system">{t('admin.beltCatalog.fields.system')}</Label>
        <Controller
          control={form.control}
          name="systemId"
          render={({ field }) => (
            <Select
              value={field.value || ''}
              onValueChange={(v) => field.onChange(v)}
            >
              <SelectTrigger id="br-system" aria-label={t('admin.beltCatalog.fields.system')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {systems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nameEn} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FormMessage message={form.formState.errors.systemId?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-level">{t('admin.beltCatalog.fields.level')}</Label>
        <Input id="br-level" type="number" {...form.register('level', { valueAsNumber: true })} />
        <FormMessage message={form.formState.errors.level?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-sort">{t('admin.beltCatalog.fields.sortOrder')}</Label>
        <Input
          id="br-sort"
          type="number"
          {...form.register('sortOrder', { valueAsNumber: true })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-romaji">{t('admin.beltCatalog.fields.nameRomaji')}</Label>
        <Input id="br-romaji" {...form.register('nameRomaji')} />
        <FormMessage message={form.formState.errors.nameRomaji?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-ja">{t('admin.beltCatalog.fields.nameJa')}</Label>
        <Input
          id="br-ja"
          {...form.register('nameJa', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-en">{t('admin.beltCatalog.fields.nameEn')}</Label>
        <Input id="br-en" {...form.register('nameEn')} />
      </FormField>
      <FormField>
        <Label htmlFor="br-sv">{t('admin.beltCatalog.fields.nameSv')}</Label>
        <Input id="br-sv" {...form.register('nameSv')} />
      </FormField>
      <FormField>
        <Label htmlFor="br-fi">{t('admin.beltCatalog.fields.nameFi')}</Label>
        <Input id="br-fi" {...form.register('nameFi')} />
      </FormField>

      <FormField>
        <Label htmlFor="br-color">{t('admin.beltCatalog.fields.beltColor')}</Label>
        <div className="flex items-center gap-2">
          <input
            id="br-color"
            type="color"
            value={form.watch('beltColor') || '#FFFFFF'}
            onChange={(e) => form.setValue('beltColor', e.target.value.toUpperCase())}
            className="h-9 w-12 rounded border border-outline-variant"
          />
          <Input
            aria-label={t('admin.beltCatalog.fields.beltColorHex')}
            value={form.watch('beltColor') || ''}
            onChange={(e) => form.setValue('beltColor', e.target.value)}
            maxLength={7}
            className="flex-1"
          />
        </div>
        <FormMessage message={form.formState.errors.beltColor?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-image">{t('admin.beltCatalog.fields.imageUrl')}</Label>
        <Input
          id="br-image"
          {...form.register('imageUrl', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-desc-en">{t('admin.beltCatalog.fields.descriptionEn')}</Label>
        <Input
          id="br-desc-en"
          {...form.register('descriptionEn', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>
      <FormField>
        <Label htmlFor="br-desc-sv">{t('admin.beltCatalog.fields.descriptionSv')}</Label>
        <Input
          id="br-desc-sv"
          {...form.register('descriptionSv', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>
      <FormField>
        <Label htmlFor="br-desc-fi">{t('admin.beltCatalog.fields.descriptionFi')}</Label>
        <Input
          id="br-desc-fi"
          {...form.register('descriptionFi', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>

      <FormField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            aria-label={t('admin.beltCatalog.fields.publiclyVisible')}
            {...form.register('publiclyVisible')}
          />
          {t('admin.beltCatalog.fields.publiclyVisible')}
        </label>
      </FormField>

      <FormField>
        <Label htmlFor="br-slug">
          {t('admin.beltCatalog.fields.slug')}
          {watchedPublic ? ' *' : ''}
        </Label>
        <Input
          id="br-slug"
          {...form.register('slug', { setValueAs: (v: string) => (v ? v : null) })}
        />
        <FormMessage message={form.formState.errors.slug?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-minage">{t('admin.beltCatalog.fields.minAge')}</Label>
        <Input
          id="br-minage"
          type="number"
          {...form.register('minAge', {
            setValueAs: (v: string) => (v === '' ? null : Number(v)),
          })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-next">{t('admin.beltCatalog.fields.nextRank')}</Label>
        <Select
          value={form.watch('nextRankId') ?? NONE}
          onValueChange={(v) => form.setValue('nextRankId', v === NONE ? null : v)}
        >
          <SelectTrigger id="br-next">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('admin.beltCatalog.noNextRank')}</SelectItem>
            {ranks
              .filter((r) => !rank || r.id !== rank.id)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nameRomaji} (level {r.level})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField>
        <Label htmlFor="br-org">{t('admin.beltCatalog.fields.organisation')}</Label>
        <Select
          value={form.watch('organisationId') ?? NONE}
          onValueChange={(v) => form.setValue('organisationId', v === NONE ? null : v)}
        >
          <SelectTrigger id="br-org">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('admin.beltCatalog.organisationGlobal')}</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nameEn} ({o.shortCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
