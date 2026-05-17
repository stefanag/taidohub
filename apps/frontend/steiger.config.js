import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

/**
 * Steiger — Feature-Sliced Design architectural linter.
 *
 * Filename matters: Steiger loads its config via cosmiconfig (module name
 * "steiger"), whose default search list is `steiger.config.{js,cjs}` and
 * `.steigerrc.{json,yaml,...}`. The previous file (`.steiger.config.ts`)
 * was never picked up — Steiger silently fell back to its built-in
 * recommended ruleset.
 *
 * `defineConfig` takes an ARRAY of config objects + plugin references +
 * global ignores (ESLint flat-config style). At least one entry MUST
 * register the FSD rules — without that, Steiger errors with
 * "At least one rule must be provided by plugins!". We spread the
 * plugin's recommended preset (which registers every rule at its default
 * severity) and then layer our own severity overrides on top.
 */
export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      'fsd/forbidden-imports': 'error',
      'fsd/insignificant-slice': 'warn',
      'fsd/no-public-api-sidestep': 'error',
      'fsd/no-segmentless-slices': 'warn',
      'fsd/public-api': 'error',
      'fsd/repetitive-naming': 'warn',
    },
  },
  {
    // LocaleSwitcher composes i18n state with auth-by-email's `updateUser`
    // so an authenticated user's locale choice gets persisted to their DB
    // row. That's an intentional cross-feature dependency — strict FSD
    // would lift it to a widget that takes a slot from the layout, but
    // the duplication cost isn't worth it for a 3-line side-effect. Allow
    // the cross-import.
    files: ['src/features/locale-switcher/**'],
    rules: {
      'fsd/forbidden-imports': 'off',
    },
  },
]);
