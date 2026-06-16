import { zodResolver } from '@hookform/resolvers/zod';
import {
  BELT_COLORS,
  CreateBeltRankSchema,
  type BeltColor,
  type BeltRank,
  type BeltVisuals,
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

/**
 * Named visual presets surfaced in the form's preset dropdown. The first option
 * (use-standard) is handled inline by calling `getBeltVisuals` against the
 * form's current system + level — that's the canonical procedural default.
 */
const VISUAL_PRESETS: Array<{ key: string; labelKey: string; value: BeltVisuals }> = [
  { key: 'plainDan', labelKey: 'admin.beltCatalog.visuals.presets.plainDan',
    value: { gradient: 'black' } },
  { key: 'shogoRenshi', labelKey: 'admin.beltCatalog.visuals.presets.shogoRenshi',
    value: { gradient: 'black', overlayTopHalf: 'magenta' } },
  { key: 'shogoKyoshi', labelKey: 'admin.beltCatalog.visuals.presets.shogoKyoshi',
    value: { gradient: 'black', overlayTopHalf: 'green' } },
  { key: 'shogoHanshi', labelKey: 'admin.beltCatalog.visuals.presets.shogoHanshi',
    value: { gradient: 'black', overlayTopHalf: 'brown' } },
  { key: 'monWhiteBase', labelKey: 'admin.beltCatalog.visuals.presets.monWhiteBase',
    value: { gradient: 'white', midLine: 'magenta', midLineGradient: true, stripe: 'black' } },
  { key: 'monColoredBase', labelKey: 'admin.beltCatalog.visuals.presets.monColoredBase',
    value: { gradient: 'magenta', midLine: 'white', stripe: 'black' } },
];

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
      visuals: rank?.visuals ?? { gradient: 'white' },
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

  // Form-bound visuals — the user authors them via the visuals editor below,
  // so preview + submit both read directly from form state.
  const watchedSystemId = form.watch('systemId');
  const watchedLevel = form.watch('level');
  const watchedColor = form.watch('beltColor');
  const watchedPublic = form.watch('publiclyVisible');
  const watchedSystem = systems.find((s) => s.id === watchedSystemId);
  const visuals = (form.watch('visuals') as BeltVisuals | undefined) ?? { gradient: 'white' };

  function applyStandardForLevel(): void {
    if (!watchedSystem) return;
    const next = getBeltVisuals(watchedSystem.code, Number(watchedLevel ?? 0));
    form.setValue('visuals', next, { shouldDirty: true });
  }

  function applyPreset(presetKey: string): void {
    const preset = VISUAL_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    form.setValue('visuals', preset.value, { shouldDirty: true });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    // Service-side guard against `nextRankId` self-reference for edit mode.
    if (rank && values.nextRankId === rank.id) {
      setSubmitError(t('admin.beltCatalog.errors.nextRankSelf'));
      return;
    }
    const parsed = CreateBeltRankSchema.parse(values);
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

      <fieldset className="rounded border border-outline-variant p-3 space-y-3">
        <legend className="px-1 text-xs uppercase text-on-surface-variant">
          {t('admin.beltCatalog.visuals.title')}
        </legend>

        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyStandardForLevel}
            disabled={!watchedSystem}
            title={t('admin.beltCatalog.visuals.useStandardHint')}
          >
            {t('admin.beltCatalog.visuals.useStandard')}
          </Button>
          <div className="min-w-[12rem]">
            <Label htmlFor="br-visuals-preset" className="text-xs">
              {t('admin.beltCatalog.visuals.presetLabel')}
            </Label>
            <Select onValueChange={applyPreset}>
              <SelectTrigger id="br-visuals-preset">
                <SelectValue placeholder={t('admin.beltCatalog.visuals.presetPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {VISUAL_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {t(p.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="br-vis-gradient">{t('admin.beltCatalog.visuals.gradient')}</Label>
            <Select
              value={visuals.gradient}
              onValueChange={(v) =>
                form.setValue('visuals', { ...visuals, gradient: v as BeltColor }, { shouldDirty: true })
              }
            >
              <SelectTrigger id="br-vis-gradient"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BELT_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="br-vis-stripe">{t('admin.beltCatalog.visuals.stripe')}</Label>
            <Select
              value={visuals.stripe ?? NONE}
              onValueChange={(v) => {
                const next = { ...visuals };
                if (v === NONE) delete next.stripe;
                else next.stripe = v as BeltColor;
                form.setValue('visuals', next, { shouldDirty: true });
              }}
            >
              <SelectTrigger id="br-vis-stripe"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('admin.beltCatalog.visuals.none')}</SelectItem>
                {BELT_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="br-vis-midline">{t('admin.beltCatalog.visuals.midLine')}</Label>
            <Select
              value={visuals.midLine ?? NONE}
              onValueChange={(v) => {
                const next = { ...visuals };
                if (v === NONE) {
                  delete next.midLine;
                  delete next.midLineGradient;
                } else {
                  next.midLine = v as BeltColor;
                }
                form.setValue('visuals', next, { shouldDirty: true });
              }}
            >
              <SelectTrigger id="br-vis-midline"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('admin.beltCatalog.visuals.none')}</SelectItem>
                {BELT_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="br-vis-overlay">{t('admin.beltCatalog.visuals.overlayTopHalf')}</Label>
            <Select
              value={visuals.overlayTopHalf ?? NONE}
              onValueChange={(v) => {
                const next = { ...visuals };
                if (v === NONE) delete next.overlayTopHalf;
                else next.overlayTopHalf = v as BeltColor;
                form.setValue('visuals', next, { shouldDirty: true });
              }}
            >
              <SelectTrigger id="br-vis-overlay"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('admin.beltCatalog.visuals.none')}</SelectItem>
                {BELT_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!visuals.badge}
              onChange={(e) => {
                const next = { ...visuals };
                if (e.target.checked) next.badge = true;
                else delete next.badge;
                form.setValue('visuals', next, { shouldDirty: true });
              }}
            />
            {t('admin.beltCatalog.visuals.badge')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!visuals.midLineGradient}
              disabled={!visuals.midLine}
              onChange={(e) => {
                const next = { ...visuals };
                if (e.target.checked) next.midLineGradient = true;
                else delete next.midLineGradient;
                form.setValue('visuals', next, { shouldDirty: true });
              }}
            />
            {t('admin.beltCatalog.visuals.midLineGradient')}
          </label>
        </div>
      </fieldset>

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
