import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ClassificationCategory } from '@repo/contracts/classification-category';
import type { Pattern } from '@repo/contracts/patterns';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import { usePatternsQuery } from '@/entities/pattern';
import { useProgressListQuery } from '@/entities/progress';
import { ProgressEditorDialog } from '@/features/progress-editor-dialog';
import { ClassificationMultiSelect, ProgressPill } from '@/shared/ui';

/**
 * Read-only student-facing pattern catalogue page. A single required
 * `pattern_type` `ClassificationMultiSelect` drives the `usePatternsQuery`
 * filter; a second `hokei_subtype` picker conditionally appears only when
 * the `hokei` chip is selected — mirroring the form's `showSubtype` logic.
 *
 * The list rerenders automatically when ids change because React Query keys
 * include them. Localised name display reads `i18n.resolvedLanguage` and
 * falls back to `nameRomaji` then `nameJa`. i18n keys are seeded in Task 11
 * — before then the keys render as their raw paths, which is acceptable for
 * an early Phase 2 surface.
 *
 * URL search-param state is intentionally NOT modelled here; Phase 1 didn't
 * either. A polish pass can add it later.
 */

type SupportedLang = 'en' | 'sv' | 'fi';

function pickLocalisedPatternName(
  row: Pattern,
  lang: SupportedLang,
): string {
  const byLang: Record<SupportedLang, string> = {
    en: row.nameEn,
    sv: row.nameSv,
    fi: row.nameFi,
  };
  return byLang[lang] || row.nameEn || row.nameRomaji || row.nameJa;
}

function pickLocalisedClassificationName(
  c: ClassificationCategory,
  lang: SupportedLang,
): string {
  const byLang: Record<SupportedLang, string> = {
    en: c.nameEn,
    sv: c.nameSv,
    fi: c.nameFi,
  };
  return byLang[lang] || c.nameEn || c.code;
}

export function PatternsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [typeIds, setTypeIds] = React.useState<string[]>([]);
  const [subtypeIds, setSubtypeIds] = React.useState<string[]>([]);

  const typeOpts = useClassificationCategoriesByRootQuery('pattern_type');
  const subtypeOpts = useClassificationCategoriesByRootQuery('hokei_subtype');

  const hokeiTypeId = React.useMemo(
    () => typeOpts.data?.find((o) => o.code === 'hokei')?.id,
    [typeOpts.data],
  );
  const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

  React.useEffect(() => {
    if (!showSubtype && subtypeIds.length > 0) setSubtypeIds([]);
  }, [showSubtype, subtypeIds.length]);

  const filterIds = React.useMemo(
    () => [...typeIds, ...(showSubtype ? subtypeIds : [])],
    [typeIds, subtypeIds, showSubtype],
  );
  const { data: patterns = [], isPending } = usePatternsQuery(filterIds);

  const { data: allProgress = [] } = useProgressListQuery();
  const progressByPatternId = React.useMemo(
    () =>
      new Map(
        allProgress
          .filter((p) => p.patternId)
          .map((p) => [p.patternId as string, p]),
      ),
    [allProgress],
  );

  const [editing, setEditing] = React.useState<{
    id: string;
    label: string;
  } | null>(null);

  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const lang: SupportedLang =
    resolved === 'sv' || resolved === 'fi' ? resolved : 'en';

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('patterns.title')}
      </h1>
      <p className="mt-2 max-w-2xl text-on-surface-variant">
        {t('patterns.description')}
      </p>

      <section
        aria-label={t('patterns.filters.patternType')}
        className="mt-6 space-y-3"
      >
        <ClassificationMultiSelect
          options={typeOpts.data ?? []}
          isPending={typeOpts.isPending}
          selectedIds={typeIds}
          onChange={setTypeIds}
          label={t('patterns.filters.patternType')}
        />
        {showSubtype ? (
          <ClassificationMultiSelect
            options={subtypeOpts.data ?? []}
            isPending={subtypeOpts.isPending}
            selectedIds={subtypeIds}
            onChange={setSubtypeIds}
            label={t('patterns.filters.hokeiSubtype')}
          />
        ) : null}
      </section>

      <section className="mt-8">
        {isPending ? (
          <p>{t('common.loading')}</p>
        ) : patterns.length === 0 ? (
          <p>{t('patterns.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {patterns.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-outline-variant p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {pickLocalisedPatternName(row, lang)}
                  </span>
                  <ProgressPill
                    className="ml-auto"
                    status={progressByPatternId.get(row.id)?.status ?? null}
                    onClick={() =>
                      setEditing({
                        id: row.id,
                        label: row.nameRomaji,
                      })
                    }
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {row.classifications.map((c) => (
                    <span
                      key={c.id}
                      className="rounded bg-surface-container px-2 py-0.5"
                    >
                      {pickLocalisedClassificationName(c, lang)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <ProgressEditorDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          contentType="pattern"
          contentId={editing.id}
          contentLabel={editing.label}
        />
      ) : null}
    </main>
  );
}
