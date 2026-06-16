/**
 * Standalone seed runner. Invoked via:
 *
 *   pnpm --filter backend run db:seed
 *
 * Composes the pure seeders (sysadmin, belt catalog, organisations) against a
 * real Drizzle client + better-auth server API. Idempotent — safe to re-run.
 */
import { eq } from 'drizzle-orm';

import { EnvSchema, type Env } from '../../config/env.schema.js';
import { buildBetterAuth } from '../auth/better-auth.js';

import { createDrizzleClient } from './client.js';
import { user } from './schema/index.js';
import { seedSysadmin, type SeedDeps } from './seed-sysadmin.js';
import { seedBeltCatalog } from './seeds/belt-catalog.seed.js';
import { seedClassifications } from './seeds/classifications.seed.js';
import { seedOrganisations } from './seeds/organisations.seed.js';
import { seedTechniques } from './seeds/techniques.seed.js';

async function main(): Promise<void> {
  const env: Env = EnvSchema.parse(process.env);

  const db = createDrizzleClient(env.DATABASE_URL);
  // The seed script never triggers password-reset emails; pass a no-op service.
  const noopEmail = {
    sendInvite: async () => undefined,
    sendPasswordReset: async () => undefined,
    sendAdminPasswordReset: async () => undefined,
  };
  const auth = buildBetterAuth(env, noopEmail);

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

  const orgs = await seedOrganisations(db);
  // eslint-disable-next-line no-console
  console.info(`[seed] organisations: inserted=${orgs.inserted}, updated=${orgs.updated}`);

  const belts = await seedBeltCatalog(db);
  // eslint-disable-next-line no-console
  console.info(
    `[seed] belt catalog: systems(+${belts.systems.inserted}/~${belts.systems.updated}) ` +
      `ranks(+${belts.ranks.inserted}/~${belts.ranks.updated}) ` +
      `shogos(+${belts.shogos.inserted}/~${belts.shogos.updated})`,
  );

  // Classifications must seed before techniques — the technique seeder
  // resolves `(rootCode, code) → uuid` against the live taxonomy.
  const classifications = await seedClassifications(db);
  // eslint-disable-next-line no-console
  console.info(
    `[seed] classifications: roots(+${classifications.roots.inserted}/~${classifications.roots.updated}) ` +
      `children(+${classifications.children.inserted}/~${classifications.children.updated})`,
  );

  const techniques = await seedTechniques(db);
  // eslint-disable-next-line no-console
  console.info(
    `[seed] techniques: rows(+${techniques.techniques.inserted}/~${techniques.techniques.updated}) ` +
      `edges(+${techniques.edges.inserted})`,
  );

  // Close the postgres-js pool so the script can exit. Without this the
  // connection pool keeps Node alive ~indefinitely and `pnpm db:seed` hangs.
  await db.$client.end();
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err);
    process.exit(1);
  });
