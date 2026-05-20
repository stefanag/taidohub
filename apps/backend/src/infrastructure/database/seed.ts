/**
 * Standalone sysadmin seed runner. Invoked via:
 *
 *   pnpm --filter backend run db:seed
 *
 * Wires the pure `seedSysadmin` function against a real Drizzle client and
 * the real better-auth server API. Idempotent — safe to re-run.
 */
import { eq } from 'drizzle-orm';

import { EnvSchema, type Env } from '../../config/env.schema.js';
import { buildBetterAuth } from '../auth/better-auth.js';

import { createDrizzleClient } from './client.js';
import { user } from './schema/index.js';
import { seedSysadmin, type SeedDeps } from './seed-sysadmin.js';

async function main(): Promise<void> {
  const env: Env = EnvSchema.parse(process.env);

  const db = createDrizzleClient(env.DATABASE_URL);
  const auth = buildBetterAuth(env);

  const deps: SeedDeps = {
    findUserByEmail: async (email) => {
      const rows = await db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      return rows[0] ?? null;
    },
    signUpEmail: async ({ email, password, name }) => {
      await auth.api.signUpEmail({
        body: { email, password, name },
      });
    },
    setRoleByEmail: async (email, role) => {
      await db.update(user).set({ role }).where(eq(user.email, email));
    },
  };

  const result = await seedSysadmin(deps, {
    email: env.SYSADMIN_EMAIL,
    password: env.SYSADMIN_PASSWORD,
    name: 'Sysadmin',
  });

  // eslint-disable-next-line no-console
  console.info(
    `[seed] sysadmin: ${env.SYSADMIN_EMAIL} (role=sysadmin, created=${result.created}, promoted=${result.promoted})`,
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});
