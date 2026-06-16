import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Technique } from '@repo/contracts/techniques';

import { Button } from '@/shared/ui';

type SupportedLang = 'en' | 'sv' | 'fi';

function pickLocalisedName(row: Technique, lang: SupportedLang): string {
  const byLang: Record<SupportedLang, string> = {
    en: row.nameEn,
    sv: row.nameSv,
    fi: row.nameFi,
  };
  return byLang[lang] || row.nameEn || row.nameRomaji || row.nameJa;
}

export interface TechniqueListItemProps {
  technique: Technique;
  /** Omitted → the Edit button is hidden. */
  onEdit?: (technique: Technique) => void;
  /** Omitted → the Delete button is hidden. */
  onDelete?: (technique: Technique) => void;
  /** Disables the Delete button while the mutation is in-flight. */
  isDeleting?: boolean;
}

/**
 * Single-row list item for a technique. Reusable across admin (with edit/delete)
 * and read-only surfaces (action callbacks omitted). Shows the localised name,
 * the romaji name, and the Japanese characters when present. Does not surface
 * any user-progress state — render that alongside, not inside.
 */
export function TechniqueListItem({
  technique,
  onEdit,
  onDelete,
  isDeleting = false,
}: TechniqueListItemProps): React.ReactElement {
  const { t, i18n } = useTranslation();

  const resolved = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);
  const lang: SupportedLang =
    resolved === 'sv' || resolved === 'fi' ? resolved : 'en';

  const localised = pickLocalisedName(technique, lang);
  const showRomaji = technique.nameRomaji && technique.nameRomaji !== localised;
  const showJa = Boolean(technique.nameJa);

  return (
    <li className="flex items-center justify-between rounded-lg border border-outline-variant p-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{technique.nameRomaji}</div>
          <div className="mt-0.5 flex items-baseline gap-2 text-xs text-on-surface-variant">
            <span className="truncate">{localised}</span>
            {showJa ? <span lang="ja" className="truncate">{technique.nameJa}</span> : null}
          </div>
      </div>
      {onEdit || onDelete ? (
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {onEdit ? (
            <Button variant="outline" size="sm" onClick={() => onEdit(technique)}>
              {t('common.edit')}
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(technique)}
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
