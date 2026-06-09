import { enUS } from 'date-fns/locale/en-US';
import { fi } from 'date-fns/locale/fi';
import { sv } from 'date-fns/locale/sv';
import type { Locale } from 'date-fns';
import { useTranslation } from 'react-i18next';

const LOCALES: Record<string, Locale> = {
  en: enUS,
  sv,
  fi,
};

/**
 * Maps the active i18next language to the matching date-fns `Locale` object.
 * Used by date-presenting widgets (Calendar, DatePicker) to localise month
 * names, weekday headers, and `format()` output. Falls back to `en-US` for
 * unknown languages.
 */
export function useDateFnsLocale(): Locale {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return LOCALES[lang] ?? enUS;
}
