import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

/**
 * Build a Drizzle client over a postgres-js connection.
 *
 * `prepare: false` keeps us compatible with Supabase's transaction-mode pooler
 * (PgBouncer) which doesn't support server-side prepared statements.
 *
 * `fetch_types: false` skips postgres-js's startup `SELECT FROM pg_type`
 * introspection. Under PgBouncer transaction mode that introspection runs in
 * a separate pooler-assigned backend than the first application query and
 * has been observed to wedge the pool under concurrent SELECTs immediately
 * after a fresh client init. We don't use any custom Postgres types so the
 * built-in type map is sufficient.
 *
 * # Singleton enforcement
 *
 * The server used to instantiate TWO clients against the same DATABASE_URL
 * — `DatabaseModule` created one and `buildBetterAuth` constructed another.
 * Each pool sized `max: 10`, sharing a 15-connection Supabase pooler cap.
 * Under load both pools saturated their quotas, the pooler refused the
 * overflow with `EMAXCONNSESSION`, and every authenticated request 500'd
 * because the AuthGuard couldn't reach the DB. The DI fix shipped (better-
 * auth now takes the shared handle) but nothing structurally prevents
 * someone from re-introducing a parallel pool the next time a seed script
 * or migration helper grows.
 *
 * `createDrizzleClient` now tracks active clients per `databaseUrl` and
 * throws on the second concurrent construction for the same URL, unless
 * the caller explicitly passes `allowMultiple: true`. Dispose a client
 * with {@link disposeDrizzleClient} (DatabaseModule does this on
 * `onModuleDestroy`) to free the slot for the next instantiation in the
 * same process (e.g. sequential test apps).
 */
export interface CreateDrizzleClientOptions {
  /**
   * Bypass the per-URL singleton check. Reserve for tightly-scoped
   * scripts that genuinely need a second short-lived client against the
   * same URL — there shouldn't be any in the server process itself.
   */
  allowMultiple?: boolean;
}

/** Active client count per `databaseUrl` (within the current process). */
const activeClientsByUrl = new Map<string, number>();

/** Remembers which URL each returned client belongs to, so dispose can decrement the right counter. */
const urlByClient = new WeakMap<DrizzleDb, string>();

export function createDrizzleClient(
  databaseUrl: string,
  options: CreateDrizzleClientOptions = {},
): DrizzleDb {
  const live = activeClientsByUrl.get(databaseUrl) ?? 0;
  if (live > 0 && options.allowMultiple !== true) {
    throw new Error(
      `[drizzle] A client for this DATABASE_URL is already active in this process.\n` +
        `  Sharing a postgres-js pool is required to stay under Supabase's session-mode pooler cap;\n` +
        `  see apps/backend/src/infrastructure/database/client.ts for context.\n` +
        `  If this call site is genuinely a short-lived secondary client, pass { allowMultiple: true }.`,
    );
  }

  const queryClient = postgres(databaseUrl, {
    prepare: false,
    fetch_types: false,
    max: 10,
  });
  const db = drizzle(queryClient, { schema });

  activeClientsByUrl.set(databaseUrl, live + 1);
  urlByClient.set(db, databaseUrl);

  return db;
}

/**
 * Closes the underlying postgres-js connection and frees the singleton
 * slot for `databaseUrl`. Idempotent. Safe to call on a client we
 * created with `allowMultiple: true`; in that case it still ends the
 * connection but no counter is decremented.
 */
export async function disposeDrizzleClient(db: DrizzleDb): Promise<void> {
  const databaseUrl = urlByClient.get(db);
  if (databaseUrl !== undefined) {
    const live = activeClientsByUrl.get(databaseUrl) ?? 0;
    if (live <= 1) {
      activeClientsByUrl.delete(databaseUrl);
    } else {
      activeClientsByUrl.set(databaseUrl, live - 1);
    }
    urlByClient.delete(db);
  }
  // `$client` is the postgres-js handle Drizzle exposes; `end()` flushes
  // pooled connections. We give it a short timeout — a hanging end()
  // shouldn't block app shutdown.
  await db.$client.end({ timeout: 5 });
}

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

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
