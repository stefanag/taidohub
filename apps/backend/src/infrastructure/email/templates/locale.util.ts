/** Normalise an arbitrary locale string to one of the three supported ones. */
export function normaliseLocale(locale: string): 'en' | 'sv' | 'fi' {
  if (locale === 'sv' || locale === 'fi') return locale;
  return 'en';
}
