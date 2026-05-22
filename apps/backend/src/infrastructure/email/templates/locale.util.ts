import type { EmailLocale } from '../email.types.js';

/** Normalise an arbitrary locale string to one of the three supported ones. */
export function normaliseLocale(locale: string): EmailLocale {
  if (locale === 'sv' || locale === 'fi') return locale;
  return 'en';
}
