import postgres from 'postgres';

/**
 * Truncates the application tables between tests. Skipped silently when no
 * `TEST_DATABASE_URL` is configured — see `app-factory.ts#hasDatabase`.
 *
 * Order matters because of FK cascades: posts -> account/session -> user.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;

  const sql = postgres(url, { max: 1 });
  try {
    await sql`TRUNCATE TABLE "posts", "session", "account", "verification", "user" RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end();
  }
}
