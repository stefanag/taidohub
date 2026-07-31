import { zodResolver } from '@hookform/resolvers/zod';
import { SetGradingRequirementsSchema } from '@repo/contracts/grading-requirements';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { EntityMultiSelect, type EntityOption } from './EntityMultiSelect.js';
import { HokeiGroupEditor } from './HokeiGroupEditor.js';

import type { SetGradingRequirementsInput } from '@repo/contracts/grading-requirements';
import type { Pattern } from '@repo/contracts/patterns';
import type { Technique } from '@repo/contracts/techniques';
import type { z } from 'zod';

import { usePatternsQuery } from '@/entities/pattern';
import {
  useRequirementsForSetQuery,
  useSetRequirementsMutation,
} from '@/entities/rank-requirement';
import { useTechniquesQuery } from '@/entities/technique';
import { HttpError } from '@/shared/api';
import { Button, FormMessage, Input, Label } from '@/shared/ui';

export interface RankRequirementsEditorProps {
  rankId: string;
  setId: string;
}

/**
 * Use the schema's *input* type (pre-`.default()` resolution) for RHF's
 * generic — mirrors `BeltRankForm`'s `z.input<...>` idiom. `useForm` +
 * `zodResolver` need the pre-default shape so fields the schema defaults
 * (e.g. `kihon: z.array(...).default([])`) are typed as optional on the
 * form, matching what RHF actually holds before validation resolves them.
 * The resolved *output* type (`SetGradingRequirementsInput`, all fields
 * present) is only produced by `SetGradingRequirementsSchema.parse(...)` at
 * submit time.
 */
export type RankRequirementsFormValues = z.input<typeof SetGradingRequirementsSchema>;

const KOBO_CODE = 'kobo';

/**
 * @param preferRomaji Kihon technique names ("mae geri", "yoko geri", …) are
 *   only ever the romaji transliteration in practice — translating them to
 *   English/Swedish reads worse than the transliteration itself. Pass `true`
 *   for kihon so the label shows `nameRomaji` regardless of UI language;
 *   defaults `false` so patterns/hokei keep their localised labels.
 */
function toOptions(
  entities: Array<Technique | Pattern>,
  lang: string,
  preferRomaji = false,
): EntityOption[] {
  const byLang: Record<string, (e: Technique | Pattern) => string> = {
    en: (e) => e.nameEn,
    sv: (e) => e.nameSv,
    fi: (e) => e.nameFi,
  };
  const pick = byLang[lang] ?? byLang.en!;
  return entities.map((e) => ({
    id: e.id,
    label: preferRomaji
      ? e.nameRomaji || pick(e) || e.nameEn
      : pick(e) || e.nameEn || e.nameRomaji,
  }));
}

function isKoboPattern(pattern: Pattern): boolean {
  return pattern.classificationsByRoot.pattern_type.some((c) => c.code === KOBO_CODE);
}

const EMPTY_DEFAULTS: RankRequirementsFormValues = {
  setId: '',
  hokeiGroups: [],
  kobo: [],
  koboTested: [],
  otherPatterns: [],
  otherPatternsTested: [],
  kihon: [],
  kihonTested: [],
  jissenMinutes: null,
  jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false,
  requiresEssay: false,
};

/**
 * Self-contained editor for one rank's grading requirements within a single
 * requirement set. Fetches initial values, renders the five sections
 * (Kihon / Kobo patterns / Other patterns / Hokei groups / Scalars), and
 * saves the whole scope via `useSetRequirementsMutation` (whole-scope
 * replace — there is no partial-field PATCH on the backend).
 *
 * Kobo-vs-other pattern split: a pattern is "kobo" if any of its
 * `classificationsByRoot.pattern_type` entries has `code: 'kobo'` — this is
 * read directly off the pattern's own classifications (Option C from the
 * task brief), so no separate classification-category lookup is needed.
 */
export function RankRequirementsEditor({
  rankId,
  setId,
}: RankRequirementsEditorProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);

  const requirementsQuery = useRequirementsForSetQuery(rankId, setId);
  const techniquesQuery = useTechniquesQuery();
  const patternsQuery = usePatternsQuery();
  const saveMut = useSetRequirementsMutation();

  const [submitError, setSubmitError] = React.useState<string | undefined>();
  const [savedAt, setSavedAt] = React.useState<number | undefined>();

  const form = useForm<RankRequirementsFormValues>({
    resolver: zodResolver(SetGradingRequirementsSchema),
    defaultValues: { ...EMPTY_DEFAULTS, setId },
  });

  // Re-seed the form once the initial values arrive. Guarded by a ref so we
  // only reset on the first successful load per rankId/setId pair — after
  // that, the form is the source of truth and a background refetch (e.g.
  // from cache invalidation after save) must not clobber in-progress edits.
  const seededKey = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!requirementsQuery.data) return;
    const key = `${rankId}:${setId}`;
    if (seededKey.current === key) return;
    seededKey.current = key;
    const data = requirementsQuery.data;
    form.reset({
      setId,
      hokeiGroups: data.hokeiGroups.map((g) => ({
        groupOrder: g.groupOrder,
        pickCount: g.pickCount,
        isTested: g.isTested,
        labelEn: g.labelEn,
        labelFi: g.labelFi,
        labelSv: g.labelSv,
        patternIds: g.patternIds,
      })),
      kobo: data.kobo,
      koboTested: data.koboTested,
      otherPatterns: data.otherPatterns,
      otherPatternsTested: data.otherPatternsTested,
      kihon: data.kihon,
      kihonTested: data.kihonTested,
      jissenMinutes: data.jissenMinutes,
      jissenTested: data.jissenTested,
      minMonthsSincePreviousRank: data.minMonthsSincePreviousRank,
      requiresTheoricExam: data.requiresTheoricExam,
      requiresEssay: data.requiresEssay,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementsQuery.data, rankId, setId]);

  const hokeiFieldArray = useFieldArray({ control: form.control, name: 'hokeiGroups' });

  // `?? []` inside the memo (rather than on a separate `const`) keeps the
  // fallback array out of the dependency list — an inline `data ?? []`
  // fallback would otherwise produce a fresh array reference on every
  // render even when `data` itself hasn't changed, which react-hooks/
  // exhaustive-deps flags as a footgun.
  const kihonOptions = React.useMemo(
    () => toOptions((techniquesQuery.data ?? []).filter((tech) => tech.isKihon), lang, true),
    [techniquesQuery.data, lang],
  );

  const koboPatterns = React.useMemo(
    () => (patternsQuery.data ?? []).filter(isKoboPattern),
    [patternsQuery.data],
  );
  const otherPatterns = React.useMemo(
    () => (patternsQuery.data ?? []).filter((p) => !isKoboPattern(p)),
    [patternsQuery.data],
  );
  const koboOptions = React.useMemo(() => toOptions(koboPatterns, lang), [koboPatterns, lang]);
  const otherOptions = React.useMemo(
    () => toOptions(otherPatterns, lang),
    [otherPatterns, lang],
  );
  const allPatternOptions = React.useMemo(
    () => toOptions(patternsQuery.data ?? [], lang),
    [patternsQuery.data, lang],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    setSavedAt(undefined);
    // Resync hokei groupOrder to array indices before submit to ensure
    // removed or reordered groups have correct sequential groupOrder values.
    const normalizedValues = {
      ...values,
      hokeiGroups: (values.hokeiGroups ?? []).map((g, i) => ({ ...g, groupOrder: i })),
    };
    // `zodResolver` already validated `values` against the schema by the
    // time this callback runs, but its RHF-facing type is still the
    // pre-default `z.input` shape. Re-parsing resolves the `.default(...)`
    // fields (empty arrays, `false`) into the full `SetGradingRequirementsInput`
    // the API client expects — and injects `setId` from props, matching the
    // brief's "inject setId on submit" contract.
    const body: SetGradingRequirementsInput = SetGradingRequirementsSchema.parse({
      ...normalizedValues,
      setId,
    });
    try {
      await saveMut.mutateAsync({ rankId, body });
      // Date.now() runs inside a submit-event callback, not during render.
      // The linter is conservative about form.handleSubmit's callback scope
      // and can't tell — flag it explicitly.
      // eslint-disable-next-line react-hooks/purity
      setSavedAt(Date.now());
    } catch (err) {
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    }
  });

  const pending = saveMut.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {/* Kihon */}
      <section aria-labelledby="rre-kihon-heading">
        <h2 id="rre-kihon-heading" className="mb-2 text-lg font-semibold">
          {t('admin.rankRequirements.sections.kihon', { defaultValue: 'Kihon' })}
        </h2>
        <Controller
          control={form.control}
          name="kihon"
          render={({ field: kihonField }) => (
            <Controller
              control={form.control}
              name="kihonTested"
              render={({ field: testedField }) => (
                <EntityMultiSelect
                  options={kihonOptions}
                  isPending={techniquesQuery.isPending}
                  selectedIds={kihonField.value ?? []}
                  onSelectedChange={kihonField.onChange}
                  testedIds={testedField.value ?? []}
                  onTestedChange={testedField.onChange}
                  emptyLabel={t('admin.rankRequirements.sections.kihonEmpty', {
                    defaultValue: 'No kihon selected yet.',
                  })}
                />
              )}
            />
          )}
        />
      </section>

      {/* Kobo patterns */}
      <section aria-labelledby="rre-kobo-heading">
        <h2 id="rre-kobo-heading" className="mb-2 text-lg font-semibold">
          {t('admin.rankRequirements.sections.kobo', { defaultValue: 'Kobo patterns' })}
        </h2>
        <Controller
          control={form.control}
          name="kobo"
          render={({ field: koboField }) => (
            <Controller
              control={form.control}
              name="koboTested"
              render={({ field: testedField }) => (
                <EntityMultiSelect
                  options={koboOptions}
                  isPending={patternsQuery.isPending}
                  selectedIds={koboField.value ?? []}
                  onSelectedChange={koboField.onChange}
                  testedIds={testedField.value ?? []}
                  onTestedChange={testedField.onChange}
                  emptyLabel={t('admin.rankRequirements.sections.koboEmpty', {
                    defaultValue: 'No kobo patterns selected yet.',
                  })}
                />
              )}
            />
          )}
        />
      </section>

      {/* Other patterns */}
      <section aria-labelledby="rre-other-heading">
        <h2 id="rre-other-heading" className="mb-2 text-lg font-semibold">
          {t('admin.rankRequirements.sections.otherPatterns', {
            defaultValue: 'Other patterns',
          })}
        </h2>
        <Controller
          control={form.control}
          name="otherPatterns"
          render={({ field: otherField }) => (
            <Controller
              control={form.control}
              name="otherPatternsTested"
              render={({ field: testedField }) => (
                <EntityMultiSelect
                  options={otherOptions}
                  isPending={patternsQuery.isPending}
                  selectedIds={otherField.value ?? []}
                  onSelectedChange={otherField.onChange}
                  testedIds={testedField.value ?? []}
                  onTestedChange={testedField.onChange}
                  emptyLabel={t('admin.rankRequirements.sections.otherPatternsEmpty', {
                    defaultValue: 'No other patterns selected yet.',
                  })}
                />
              )}
            />
          )}
        />
      </section>

      {/* Hokei groups */}
      <section aria-labelledby="rre-hokei-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="rre-hokei-heading" className="text-lg font-semibold">
            {t('admin.rankRequirements.sections.hokeiGroups', {
              defaultValue: 'Hokei groups',
            })}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              hokeiFieldArray.append({
                groupOrder: hokeiFieldArray.fields.length,
                pickCount: 1,
                isTested: false,
                labelEn: null,
                labelFi: null,
                labelSv: null,
                patternIds: [],
              })
            }
          >
            {t('admin.rankRequirements.hokei.add', { defaultValue: 'Add group' })}
          </Button>
        </div>
        {hokeiFieldArray.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('admin.rankRequirements.hokei.empty', {
              defaultValue: 'No hokei groups yet.',
            })}
          </p>
        ) : (
          <div className="space-y-4">
            {hokeiFieldArray.fields.map((field, index) => (
              <HokeiGroupEditor
                key={field.id}
                index={index}
                control={form.control}
                register={form.register}
                patternOptions={allPatternOptions}
                isPatternsPending={patternsQuery.isPending}
                onRemove={hokeiFieldArray.remove}
              />
            ))}
          </div>
        )}
      </section>

      {/* Scalars */}
      <section aria-labelledby="rre-scalars-heading">
        <h2 id="rre-scalars-heading" className="mb-2 text-lg font-semibold">
          {t('admin.rankRequirements.scalars.title', { defaultValue: 'Other requirements' })}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rre-jissen-minutes">
              {t('admin.rankRequirements.scalars.jissenMinutes', {
                defaultValue: 'Jissen minutes',
              })}
            </Label>
            <Input
              id="rre-jissen-minutes"
              type="number"
              min={1}
              {...form.register('jissenMinutes', {
                setValueAs: (v: string) => (v === '' || v === null ? null : Number(v)),
              })}
            />
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              aria-label={t('admin.rankRequirements.scalars.jissenTested', {
                defaultValue: 'Jissen tested',
              })}
              {...form.register('jissenTested')}
            />
            {t('admin.rankRequirements.scalars.jissenTested', {
              defaultValue: 'Jissen tested',
            })}
          </label>

          <div>
            <Label htmlFor="rre-min-months">
              {t('admin.rankRequirements.scalars.minMonthsSincePreviousRank', {
                defaultValue: 'Min months since previous rank',
              })}
            </Label>
            <Input
              id="rre-min-months"
              type="number"
              min={0}
              {...form.register('minMonthsSincePreviousRank', {
                setValueAs: (v: string) => (v === '' || v === null ? null : Number(v)),
              })}
            />
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              aria-label={t('admin.rankRequirements.scalars.requiresTheoricExam', {
                defaultValue: 'Requires theoretical exam',
              })}
              {...form.register('requiresTheoricExam')}
            />
            {t('admin.rankRequirements.scalars.requiresTheoricExam', {
              defaultValue: 'Requires theoretical exam',
            })}
          </label>

          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              aria-label={t('admin.rankRequirements.scalars.requiresEssay', {
                defaultValue: 'Requires essay',
              })}
              {...form.register('requiresEssay')}
            />
            {t('admin.rankRequirements.scalars.requiresEssay', {
              defaultValue: 'Requires essay',
            })}
          </label>
        </div>
      </section>

      <FormMessage message={submitError} />
      {savedAt && !submitError ? (
        <p role="status" className="text-sm text-primary">
          {t('admin.rankRequirements.saved', { defaultValue: 'Saved.' })}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {t('common.save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </form>
  );
}
