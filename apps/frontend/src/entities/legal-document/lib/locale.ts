import type { LegalLocale } from '@repo/contracts/legal-documents';

/**
 * The name of `locale` written in `inLocale`, e.g. ("sv", "en") → "Swedish",
 * ("sv", "sv") → "svenska". As Intl writes it, so it fits mid-sentence; pass
 * `capitalize` for buttons and menu items. Falls back to the code when the
 * browser lacks Intl.DisplayNames data.
 */
export function languageName(
  locale: LegalLocale | string,
  inLocale: string,
  { capitalize = false }: { capitalize?: boolean } = {},
): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(locale);
    if (!name) return locale;
    return capitalize ? name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1) : name;
  } catch {
    return locale;
  }
}
