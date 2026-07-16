import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Pattern } from '@repo/contracts/patterns';

import { Button } from '@/shared/ui';

type SupportedLang = 'en' | 'sv' | 'fi';

function pickLocalisedName(row: Pattern, lang: SupportedLang): string {
  const byLang: Record<SupportedLang, string> = {
    en: row.nameEn,
    sv: row.nameSv,
    fi: row.nameFi,
  };
  return byLang[lang] || row.nameEn || row.nameRomaji || row.nameJa;
}

export interface PatternListItemProps {
  pattern: Pattern;
  /** Omitted → the row is not clickable. Used by admin to navigate to view. */
  onClick?: (pattern: Pattern) => void;
  /** Omitted → the Edit button is hidden. */
  onEdit?: (pattern: Pattern) => void;
  /** Omitted → the Delete button is hidden. */
  onDelete?: (pattern: Pattern) => void;
  /** Disables the Delete button while the mutation is in-flight. */
  isDeleting?: boolean;
}

/**
 * Single-row list item for a pattern. Reusable across admin (with
 * onClick + delete) and read-only surfaces (action callbacks omitted).
 * Shows the romaji name on the primary line and the localised name plus
 * Japanese characters on the secondary line when present. Mirrors
 * `TechniqueListItem` so both catalogues read consistently.
 */
export function PatternListItem({
  pattern,
  onClick,
  onEdit,
  onDelete,
  isDeleting = false,
}: PatternListItemProps): React.ReactElement {
  const { t, i18n } = useTranslation();

  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const lang: SupportedLang =
    resolved === 'sv' || resolved === 'fi' ? resolved : 'en';

  const localised = pickLocalisedName(pattern, lang);
  const showLocalised = Boolean(localised) && localised !== pattern.nameRomaji;
  const showJa = Boolean(pattern.nameJa);

  const liClass = onClick
    ? 'flex cursor-pointer items-center justify-between rounded-lg border border-outline-variant p-3 hover:bg-surface-container-low/50'
    : 'flex items-center justify-between rounded-lg border border-outline-variant p-3';

  return (
    // TODO(a11y): the click handler on <li> should be a proper button around
    // the info area, not on the row itself — the row also contains Edit/Delete
    // buttons and nested interactive roles are ambiguous. Tracked as a follow-up.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <li className={liClass} onClick={onClick ? () => onClick(pattern) : undefined}>
      <div className="min-w-0">
        <div className="truncate font-medium">{pattern.nameRomaji}</div>
        {showLocalised || showJa ? (
          <div className="mt-0.5 flex items-baseline gap-2 text-xs text-on-surface-variant">
            {showLocalised ? <span className="truncate">{localised}</span> : null}
            {showJa ? (
              <span lang="ja" className="truncate">
                {pattern.nameJa}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {onEdit || onDelete ? (
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {onEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(pattern);
              }}
            >
              {t('common.edit')}
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(pattern);
              }}
              disabled={isDeleting}
            >
              {t('common.delete')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
