import nodeConfig from '@repo/eslint-config/node';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nodeConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        // Nest resolves constructor and parameter types from emitted
        // decorator metadata, so a class imported as a type disappears at
        // runtime. With these two set, consistent-type-imports leaves every
        // file that has a decorator alone instead of "fixing" it into a DI
        // error. Mirrors the compiler options in @repo/tsconfig/nest.json.
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      // NestJS relies heavily on decorators that emit metadata via parameter
      // declarations; class-method "useless" warnings would fire on
      // controller methods.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
