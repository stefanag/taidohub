import { defineConfig } from 'steiger';

/**
 * Steiger — Feature-Sliced Design architectural linter.
 *
 * `defineConfig` takes an ARRAY of config objects (ESLint flat-config style),
 * not a single object. Passing a single object made Steiger fall back to its
 * built-in defaults (every rule at `error`), which is why
 * `fsd/insignificant-slice` was reported as an error even though we'd set it
 * to `warn`.
 */
export default defineConfig([
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
    // LocaleSwitcher composes i18n state with auth-by-email's `updateUser` so
    // an authenticated user's locale choice gets persisted to their DB row.
    // That's an intentional cross-feature dependency — strict FSD would lift
    // it to a widget that takes a slot from the layout, but the duplication
    // cost isn't worth it for a 3-line side-effect. Allow the cross-import.
    files: ['src/features/locale-switcher/**'],
    rules: {
      'fsd/forbidden-imports': 'off',
    },
  },
]);
