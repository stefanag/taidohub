import i18n from './index.js';

const localeOf = (): string => i18n.resolvedLanguage ?? i18n.language ?? 'en';

/**
 * Format a date in the currently active locale.
 *
 * `opts` accepts the standard `Intl.DateTimeFormatOptions`. With no `opts`,
 * uses the locale's default short date.
 */
export function formatDate(
  d: Date | string | number,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const date = d instanceof Date ? d : new Date(d);
  try {
    return new Intl.DateTimeFormat(localeOf(), opts).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(date);
  }
}

/**
 * Format a number in the currently active locale.
 */
export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(localeOf(), opts).format(n);
  } catch {
    return new Intl.NumberFormat('en-US', opts).format(n);
  }
}
