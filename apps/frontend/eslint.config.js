import react from '@repo/eslint-config/react';

/**
 * ESLint config for the frontend app.
 *
 * - Extends the shared React preset.
 * - Adds `import/no-restricted-paths` to enforce Feature-Sliced Design's
 *   strict import-direction rule:
 *     app    → pages, widgets, features, entities, shared
 *     pages  → widgets, features, entities, shared
 *     widgets → features, entities, shared
 *     features → entities, shared
 *     entities → shared
 *     shared → (nothing higher)
 *   And same-layer slices cannot import each other.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...react,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // shared cannot import from any higher layer
            {
              target: './src/shared',
              from: './src/app',
              message: 'FSD: shared/ must not import from app/.',
            },
            {
              target: './src/shared',
              from: './src/pages',
              message: 'FSD: shared/ must not import from pages/.',
            },
            {
              target: './src/shared',
              from: './src/widgets',
              message: 'FSD: shared/ must not import from widgets/.',
            },
            {
              target: './src/shared',
              from: './src/features',
              message: 'FSD: shared/ must not import from features/.',
            },
            {
              target: './src/shared',
              from: './src/entities',
              message: 'FSD: shared/ must not import from entities/.',
            },
            // entities cannot import from features/widgets/pages/app
            {
              target: './src/entities',
              from: './src/app',
              message: 'FSD: entities/ must not import from app/.',
            },
            {
              target: './src/entities',
              from: './src/pages',
              message: 'FSD: entities/ must not import from pages/.',
            },
            {
              target: './src/entities',
              from: './src/widgets',
              message: 'FSD: entities/ must not import from widgets/.',
            },
            {
              target: './src/entities',
              from: './src/features',
              message: 'FSD: entities/ must not import from features/.',
            },
            // features cannot import from widgets/pages/app
            {
              target: './src/features',
              from: './src/app',
              message: 'FSD: features/ must not import from app/.',
            },
            {
              target: './src/features',
              from: './src/pages',
              message: 'FSD: features/ must not import from pages/.',
            },
            {
              target: './src/features',
              from: './src/widgets',
              message: 'FSD: features/ must not import from widgets/.',
            },
            // widgets cannot import from pages/app
            {
              target: './src/widgets',
              from: './src/app',
              message: 'FSD: widgets/ must not import from app/.',
            },
            {
              target: './src/widgets',
              from: './src/pages',
              message: 'FSD: widgets/ must not import from pages/.',
            },
            // pages cannot import from app
            {
              target: './src/pages',
              from: './src/app',
              message: 'FSD: pages/ must not import from app/.',
            },
            // same-layer slice → slice imports are forbidden
            // (a slice may only import its own sibling files via its own subtree)
            {
              target: './src/entities/post',
              from: './src/entities',
              except: ['./post'],
              message: 'FSD: entities slices may not import each other.',
            },
            {
              target: './src/features/auth-by-email',
              from: './src/features',
              except: ['./auth-by-email'],
              message: 'FSD: features slices may not import each other.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'dist/**',
      'storybook-static/**',
      'coverage/**',
      'src/app/router/routeTree.gen.ts',
    ],
  },
];
