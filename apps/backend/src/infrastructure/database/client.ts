import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

/**
 * Build a Drizzle client over a postgres-js connection.
 *
 * `prepare: false` keeps us compatible with Supabase's transaction-mode pooler
 * (PgBouncer) which doesn't support server-side prepared statements.
 */
export function createDrizzleClient(databaseUrl: string) {
  const queryClient = postgres(databaseUrl, {
    prepare: false,
    max: 10,
  });
  return drizzle(queryClient, { schema });
}

export type DrizzleDb = ReturnType<typeof createDrizzleClient>;

/** DI token for injecting the Drizzle client into providers. */
export const DRIZZLE = Symbol('DRIZZLE');
