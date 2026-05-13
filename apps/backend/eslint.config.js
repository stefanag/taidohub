import nodeConfig from '@repo/eslint-config/node';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nodeConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // NestJS relies heavily on decorators that emit metadata via parameter
      // declarations; class-method "useless" warnings would fire on
      // controller methods.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
