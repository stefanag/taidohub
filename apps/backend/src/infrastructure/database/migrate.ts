/**
 * Standalone migration runner. Invoked via `pnpm --filter backend db:migrate`.
 *
 * Connects with `DIRECT_URL` (non-pooled) because drizzle-kit's migration
 * machinery needs full Postgres protocol support that PgBouncer in
 * transaction-pooling mode does not provide.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error('DIRECT_URL is required to run migrations.');
  }

  const migrationClient = postgres(url, { max: 1 });
  const db = drizzle(migrationClient);

  // eslint-disable-next-line no-console
  console.info('[migrate] applying migrations from ./drizzle');
  await migrate(db, { migrationsFolder: './drizzle' });
  // eslint-disable-next-line no-console
  console.info('[migrate] done');

  await migrationClient.end();
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', err);
  process.exit(1);
});
