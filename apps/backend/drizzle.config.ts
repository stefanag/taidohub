import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Migrations run against `DIRECT_URL` (the direct, non-pooled Supabase
 * connection) because the transactional pooler does not support the
 * advisory-lock semantics drizzle-kit needs.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    // Validated at boot by `env.schema.ts`; tolerated to be undefined here
    // because `drizzle-kit` is only invoked from explicit CLI scripts.
    url: process.env.DIRECT_URL!,
  },
  strict: true,
  verbose: true,
});
