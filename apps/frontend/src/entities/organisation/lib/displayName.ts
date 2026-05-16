import type { Organisation } from '@repo/contracts/organisations';

type Locale = 'en' | 'sv' | 'fi' | 'ja';

/** Pick the localized name with a deterministic fallback to English. */
export function displayName(org: Organisation, locale: Locale | string): string {
  const lookup: Record<Locale, string | null> = {
    en: org.nameEn,
    sv: org.nameSv,
    fi: org.nameFi,
    ja: org.nameJa,
  };
  const lang = (locale.split('-')[0] ?? 'en') as Locale;
  return lookup[lang] && lookup[lang]!.length > 0 ? lookup[lang]! : org.nameEn;
}
