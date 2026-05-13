import { defineConfig } from '@feature-sliced/steiger';

/**
 * Steiger — Feature-Sliced Design architectural linter.
 * Enables default rule set (import direction, public API enforcement,
 * forbidden cross-slice imports, segment naming, etc.).
 */
export default defineConfig({
  rules: {
    'fsd/forbidden-imports': 'error',
    'fsd/insignificant-slice': 'warn',
    'fsd/no-public-api-sidestep': 'error',
    'fsd/no-segmentless-slices': 'warn',
    'fsd/public-api': 'error',
    'fsd/repetitive-naming': 'warn',
  },
});
