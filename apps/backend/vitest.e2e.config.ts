import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * End-to-end test config.
 *
 * Boots a real NestJS app via `test/helpers/app-factory.ts` and exercises it
 * over HTTP with supertest. Runs sequentially because tests share a database.
 *
 * Loads `.env.e2e` from `apps/backend/` if present so `pnpm --filter backend test:e2e`
 * works locally against `docker-compose.e2e.yml` (or any other TEST_DATABASE_URL)
 * without extra flags. In CI the env vars come from the workflow directly and this
 * file is absent — the load is a no-op.
 */
const envFile = resolve(__dirname, '.env.e2e');
if (existsSync(envFile)) {
  // Available since Node 20.12. Won't overwrite variables already set in the
  // current process, so CI-provided env always wins over a stray local file.
  process.loadEnvFile(envFile);
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/e2e/**/*.e2e.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
