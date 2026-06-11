import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ClassificationCategory } from '@repo/contracts/classification-category';
import type { Technique } from '@repo/contracts/techniques';

import { useTechniquesQuery } from '@/entities/technique';
import { ClassificationMultiSelect } from '@/shared/ui';

/**
 * Read-only student-facing technique catalogue page. Three chip-style
 * `ClassificationMultiSelect` filters drive the `useTechniquesQuery` filter
 * set (flattened across roots); the list rerenders automatically when ids
 * change because React Query keys include them.
 *
 * Localised name display reads `i18n.resolvedLanguage` and falls back to
 * `nameRomaji` then `code`. i18n keys are seeded in Task 12 — before then
 * the keys render as their raw paths, which is acceptable for an early
 * Phase 1 surface.
 *
 * URL search-param state is intentionally NOT modelled here; local React
 * state keeps Task 11 small. A polish pass can add it later.
 */

type SupportedLang = 'en' | 'sv' | 'fi';

function pickLocalisedTechniqueName(
  row: Technique,
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

export function TechniquesPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [typeIds, setTypeIds] = React.useState<string[]>([]);
  const [sotaiIds, setSotaiIds] = React.useState<string[]>([]);
  const [attackIds, setAttackIds] = React.useState<string[]>([]);

  const filterIds = React.useMemo(
    () => [...typeIds, ...sotaiIds, ...attackIds],
    [typeIds, sotaiIds, attackIds],
  );
  const { data: techniques = [], isPending } = useTechniquesQuery(filterIds);

  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const lang: SupportedLang =
    resolved === 'sv' || resolved === 'fi' ? resolved : 'en';

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('techniques.title')}
      </h1>
      <p className="mt-2 max-w-2xl text-on-surface-variant">
        {t('techniques.description')}
      </p>

      <section
        aria-label={t('techniques.filters.techniqueType')}
        className="mt-6 space-y-3"
      >
        <ClassificationMultiSelect
          rootCode="technique_type"
          selectedIds={typeIds}
          onChange={setTypeIds}
          label={t('techniques.filters.techniqueType')}
        />
        <ClassificationMultiSelect
          rootCode="sotai_category"
          selectedIds={sotaiIds}
          onChange={setSotaiIds}
          label={t('techniques.filters.sotaiCategory')}
        />
        <ClassificationMultiSelect
          rootCode="attack_type"
          selectedIds={attackIds}
          onChange={setAttackIds}
          label={t('techniques.filters.attackType')}
        />
      </section>

      <section className="mt-8">
        {isPending ? (
          <p>{t('common.loading')}</p>
        ) : techniques.length === 0 ? (
          <p>{t('techniques.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {techniques.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-outline-variant p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {pickLocalisedTechniqueName(row, lang)}
                  </span>
                  {row.isKihon ? (
                    <span className="text-xs text-on-surface-variant">
                      {t('techniques.form.isKihon')}
                    </span>
                  ) : null}
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
    </main>
  );
}
