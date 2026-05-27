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
  {
    // OrganisationForm renders the AuditLogTable widget in its "Activity"
    // tab when editing an existing org — the widget is the right unit to
    // own all the audit-log query/render/pagination logic, but FSD's strict
    // layering forbids features from importing widgets. Lifting the form
    // out of features/ would force a much larger rearrangement (the page
    // already composes form+tree+dialogs as features). Allow the cross-
    // import here only.
    files: ['src/features/organisation-form/**'],
    rules: {
      'fsd/forbidden-imports': 'off',
    },
  },
  {
    // The AuditLogTable test mocks the entity's API module by its deep
    // path because `audit-log.queries.ts` imports the fetcher from there
    // directly (not via the barrel). Mocking the barrel wouldn't reach
    // that import, so `vi.mock` MUST target the deep path. Allow the
    // public-API sidestep for this test file only.
    files: ['src/widgets/audit-log-table/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The user-form tests mock the organisation and membership entity API
    // modules by their deep paths because `organisation.queries.ts` and
    // `membership.queries.ts` import their fetchers from there directly
    // (not via the barrel). Mocking the barrel wouldn't reach those
    // imports, so `vi.mock` MUST target the deep paths. Allow the
    // public-API sidestep for these test files only.
    files: ['src/features/user-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // UserForm composes the GradingTimeline and RankHistoryFormDialog
    // features in the admin Grading history tab. Strict FSD forbids
    // features from importing other features; lifting UserForm to a widget
    // would force a large rearrangement of the admin-users page. Allow
    // the cross-feature imports for this slice only.
    files: ['src/features/user-form/**'],
    rules: {
      'fsd/forbidden-imports': 'off',
    },
  },
  {
    // The invite-user-dialog test mocks the user entity API module by its
    // deep path because `user.queries.ts` imports the fetcher from there
    // directly (not via the barrel). Mocking the barrel wouldn't reach that
    // import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/invite-user-dialog/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The admin-users page test mocks user, organisation, and membership entity
    // API modules by their deep paths because the query-options factories
    // capture the fetchers directly from those modules (not via the barrel).
    // Mocking the barrels wouldn't reach those imports, so `vi.mock` MUST
    // target the deep paths. Allow the public-API sidestep for this test file
    // only.
    files: ['src/pages/admin-users/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The set-password-form test mocks the user entity API module by its
    // deep path; mocking the barrel wouldn't reach the captured fetcher
    // reference. Allow the public-API sidestep for this test file only.
    files: ['src/features/set-password-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The profile-form test mocks the profile entity API module by its deep
    // path because `profile.queries.ts` imports the fetcher from there
    // directly (not via the barrel). Mocking the barrel wouldn't reach that
    // import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/profile-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The belt-system-form test mocks the belt-system and organisation entity
    // API modules by their deep paths because the query-options factories
    // capture the fetchers directly from those modules (not via the barrel).
    // Mocking the barrels wouldn't reach those imports, so `vi.mock` MUST
    // target the deep paths. Allow the public-API sidestep for this test file
    // only.
    files: ['src/features/belt-system-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The belt-rank-form test mocks the belt-rank, belt-system, and organisation
    // entity API modules by their deep paths because the query-options factories
    // capture the fetchers directly from those modules (not via the barrel).
    // Mocking the barrels wouldn't reach those imports, so `vi.mock` MUST
    // target the deep paths. Allow the public-API sidestep for this test file
    // only.
    files: ['src/features/belt-rank-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The shogo-title-form test mocks the shogo-title and belt-rank entity API
    // modules by their deep paths because the query-options factories capture
    // the fetchers directly from those modules (not via the barrel). Mocking
    // the barrels wouldn't reach those imports, so `vi.mock` MUST target the
    // deep paths. Allow the public-API sidestep for this test file only.
    files: ['src/features/shogo-title-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The belt-systems-table test mocks the belt-system entity API module by
    // its deep path because `belt-system.queries.ts` imports the fetcher from
    // there directly (not via the barrel). Mocking the barrel wouldn't reach
    // that import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/belt-systems-table/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The belt-ranks-table test mocks the belt-rank entity API module by its
    // deep path because `belt-rank.queries.ts` imports the fetcher from there
    // directly (not via the barrel). Mocking the barrel wouldn't reach that
    // import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/belt-ranks-table/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The shogo-titles-table test mocks the shogo-title entity API module by
    // its deep path because `shogo-title.queries.ts` imports the fetcher from
    // there directly (not via the barrel). Mocking the barrel wouldn't reach
    // that import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/shogo-titles-table/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The admin-belt-catalog page test mocks the belt-system, belt-rank,
    // shogo-title, and organisation entity API modules by their deep paths
    // because the query-options factories capture the fetchers directly from
    // those modules (not via the barrel). Mocking the barrels wouldn't reach
    // those imports, so `vi.mock` MUST target the deep paths. Allow the
    // public-API sidestep for this test file only.
    files: ['src/pages/admin-belt-catalog/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The club-card widget test mocks the membership and organisation entity
    // API modules by their deep paths because the query-options factories
    // capture the fetchers directly from those modules (not via the barrel).
    // Mocking the barrels wouldn't reach those imports, so `vi.mock` MUST
    // target the deep paths. Allow the public-API sidestep for this test file
    // only.
    files: ['src/widgets/club-card/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
  {
    // The rank-history-form test mocks the belt-rank, shogo-title, and
    // rank-history entity API modules by their deep paths because the
    // query-options / mutation factories capture the fetchers directly from
    // those modules (not via the barrel). Mocking the barrels wouldn't reach
    // those imports, so `vi.mock` MUST target the deep paths. It also mocks
    // `auth-by-email`'s API deep path to prevent `refreshSession()` from
    // making real network requests during tests. Allow both public-API sidestep
    // and cross-feature imports for this test file only.
    files: ['src/features/rank-history-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
      'fsd/forbidden-imports': 'off',
    },
  },
]);
