import postgres from 'postgres';

/**
 * Truncates every application table in the `public` schema between test
 * suites. Skipped silently when no `TEST_DATABASE_URL` is configured — see
 * `app-factory.ts#hasDatabase`.
 *
 * A dynamic truncate is used (rather than a hard-coded table list) so tests
 * do not silently accumulate rows when a new table is added to the schema.
 * `__drizzle_migrations` is excluded — deleting it would force a re-migrate
 * on the next boot.
 *
 * The single `TRUNCATE … RESTART IDENTITY CASCADE` statement follows every
 * FK cascade in one shot, so ordering the table list is not necessary. If
 * a table has no cascading in from another, Postgres just includes it
 * directly; if it does, the cascade lands on the same row it would have
 * hit anyway.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1 });
  try {
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('__drizzle_migrations')
    `;
    if (tables.length === 0) return;

    // Identifier quoting is safe here because the table names come from
    // pg_catalog, not user input. We still double-quote them to preserve
    // case-sensitive names.
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await sql.end();
  }
}
