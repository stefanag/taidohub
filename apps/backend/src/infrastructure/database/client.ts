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

/**
 * The argument Drizzle hands to a `db.transaction(async (tx) => …)` callback.
 * Structurally compatible with `DrizzleDb` for query-builder calls (insert,
 * update, delete, select), but lacks `$client`, so we expose this as a separate
 * narrower type for code that runs inside a transaction.
 */
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** Either the root db or a transaction handle — accepted by repo methods. */
export type DrizzleExecutor = DrizzleDb | DrizzleTx;

/** DI token for injecting the Drizzle client into providers. */
export const DRIZZLE = Symbol('DRIZZLE');
