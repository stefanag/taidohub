import type { EmailLocale } from '../email.types.js';

/** Normalise an arbitrary locale string to one of the three supported ones. */
export function normaliseLocale(locale: string): EmailLocale {
  if (locale === 'sv' || locale === 'fi') return locale;
  return 'en';
}

/**
 * Who sent the email when the sysadmin has no display name. It starts a
 * sentence in every template, hence the capital letter.
 */
export function genericAdmin(locale: EmailLocale): string {
  switch (locale) {
    case 'sv':
      return 'En systemadministratör';
    case 'fi':
      return 'Järjestelmänvalvoja';
    default:
      return 'A system administrator';
  }
}
