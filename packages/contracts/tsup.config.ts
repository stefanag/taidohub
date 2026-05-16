import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    posts: 'src/posts.ts',
    users: 'src/users.ts',
    auth: 'src/auth.ts',
    casl: 'src/casl.ts',
    errors: 'src/errors.ts',
    routes: 'src/routes.ts',
    openapi: 'src/openapi.ts',
    organisations: 'src/organisations.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
  treeshake: true,
  outDir: 'dist',
});
