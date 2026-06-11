import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ClassificationCategory } from '@repo/contracts/classification-category';

import { Button } from './button.js';
import { Label } from './label.js';

/**
 * A flex-wrapped, chip-style multi-selector backed by a list of taxonomy
 * options. The caller fetches the options (typically via
 * `useClassificationCategoriesByRootQuery(rootCode)`) and passes them in;
 * this primitive stays pure-presentational so the `shared` layer keeps no
 * dependency on the `entities` layer.
 *
 * - Active options are always visible. Inactive options are hidden by default
 *   but remain visible when present in `selectedIds` so an admin editing a
 *   historical row keeps the chip rather than silently dropping the link.
 * - Display label is localised by `i18n.resolvedLanguage`, falling back to
 *   `nameEn`, then `code`.
 * - `aria-pressed` reflects selection state for accessibility.
 */
export interface ClassificationMultiSelectProps {
  /** Available options from the matching root. Caller fetches them. */
  options: ClassificationCategory[];
  /** Optional loading indicator — caller can pass it through from React Query. */
  isPending?: boolean;
  selectedIds: string[];
  onChange: (next: string[]) => void;
  /** Visual label rendered above the chip row. */
  label?: string;
  /** Renders a `*` marker after the label. Backend additionally enforces the constraint. */
  required?: boolean;
  className?: string;
}

type SupportedLang = 'en' | 'sv' | 'fi';

function pickLocalisedName(
  option: ClassificationCategory,
  lang: SupportedLang,
): string {
  const byLang: Record<SupportedLang, string> = {
    en: option.nameEn,
    sv: option.nameSv,
    fi: option.nameFi,
  };
  return byLang[lang] || option.nameEn || option.code;
}

export function ClassificationMultiSelect({
  options: rawOptions,
  isPending = false,
  selectedIds,
  onChange,
  label,
  required,
  className,
}: ClassificationMultiSelectProps): React.ReactElement {
  const { i18n } = useTranslation();
  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const lang: SupportedLang =
    resolved === 'sv' || resolved === 'fi' ? resolved : 'en';

  const options = React.useMemo<ClassificationCategory[]>(() => {
    const selected = new Set(selectedIds);
    return rawOptions.filter((opt) => opt.isActive || selected.has(opt.id));
  }, [rawOptions, selectedIds]);

  const toggle = React.useCallback(
    (id: string) => {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((existing) => existing !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [onChange, selectedIds],
  );

  return (
    <div className={className}>
      {label ? (
        <Label className="mb-2 block">
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </Label>
      ) : null}
      {isPending && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = selectedIds.includes(opt.id);
            return (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => toggle(opt.id)}
              >
                {pickLocalisedName(opt, lang)}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
