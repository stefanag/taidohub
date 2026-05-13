import globals from 'globals';

import base from './base.js';

/**
 * Node-targeted projects (NestJS backend, contracts, scripts). No DOM globals.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-process-exit': 'off',
    },
  },
];
