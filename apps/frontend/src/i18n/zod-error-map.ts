import { z } from 'zod';

import i18n from './index.js';

/**
 * Routes every Zod issue through the active i18n bundle. Registered once
 * from `i18n/index.ts` via `z.setErrorMap(i18nZodErrorMap)`.
 *
 * The map closes over the live `i18n` singleton, so `safeParse(...)` after
 * `i18n.changeLanguage(...)` yields the new language's messages.
 *
 * Note (Zod 4 adaptation): the error map signature is `(issue) => ...`
 * (no `ctx` argument), and the `invalid_string` code from Zod 3 has been
 * replaced with `invalid_format` (using `issue.format` instead of
 * `issue.validation`). For codes we don't translate, returning `undefined`
 * makes Zod fall back to its default English messages.
 */
export const i18nZodErrorMap: z.ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: i18n.t('zod.invalidType', { expected: issue.expected }) };
    case 'too_small':
      return { message: i18n.t('zod.tooSmall', { min: String(issue.minimum) }) };
    case 'too_big':
      return { message: i18n.t('zod.tooBig', { max: String(issue.maximum) }) };
    case 'invalid_format':
      if (issue.format === 'email') {
        return { message: i18n.t('zod.invalidEmail') };
      }
      return { message: i18n.t('zod.invalidString') };
    default:
      return undefined;
  }
};
