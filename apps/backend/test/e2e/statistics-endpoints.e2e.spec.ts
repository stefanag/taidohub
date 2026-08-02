/**
 * Endpoint e2e for the statistics feature (Task 5).
 *
 * Covers the happy path across both controllers plus the sysadmin-only
 * gate:
 *  1. GET /api/statistics/organisation/:id as sysadmin -> 200, with the
 *     seeded membership + rank counts reflected (populated by the
 *     `rank_history`/`organisation_membership` AFTER-triggers from
 *     migration `0033_statistics_triggers.sql`, not by an explicit
 *     rebuild — this also exercises that the triggers work end-to-end).
 *  2. POST /api/admin/statistics/rebuild as sysadmin -> 200,
 *     `{ ok: true, durationMs: expect.any(Number) }`.
 *  3. GET /api/statistics/platform as a non-sysadmin caller -> 403,
 *     `{ error: { code: 'FORBIDDEN', message } }`.
 *
 * Auth pattern mirrors `grading-requirements.e2e.spec.ts`: sign up via
 * better-auth's server API, flip the platform `role` column directly in
 * the DB for the sysadmin actor, then sign in over HTTP to get a session
 * cookie for supertest.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import { beltRanks } from '../../src/infrastructure/database/schema/belt-ranks.js';
import { beltSystems } from '../../src/infrastructure/database/schema/belt-systems.js';
import { organisationMembership } from '../../src/infrastructure/database/schema/memberships.js';
import { organisations } from '../../src/infrastructure/database/schema/organisations.js';
import { rankHistory } from '../../src/infrastructure/database/schema/rank-history.js';
import { user as userTable } from '../../src/infrastructure/database/schema/users.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';
import { resetDatabase } from '../helpers/db-reset.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sign up a user via better-auth's server API, then update the `role`
 * column in the DB directly. Returns the user row id.
 */
async function createUser(
  auth: Auth,
  db: DrizzleDb,
  opts: { email: string; password: string; name: string; role?: 'sysadmin' | 'user' },
): Promise<string> {
  await auth.api.signUpEmail({
    body: { email: opts.email, password: opts.password, name: opts.name },
  });
  if (opts.role && opts.role !== 'user') {
    await db.update(userTable).set({ role: opts.role }).where(eq(userTable.email, opts.email));
  }
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, opts.email))
    .limit(1);
  if (!row) throw new Error(`createUser: no row for ${opts.email}`);
  return row.id;
}

/**
 * Sign in via the HTTP endpoint and return the raw `name=value` session
 * cookie for use with supertest's `.set('Cookie', ...)`.
 */
async function signIn(
  app: NestExpressApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`signIn failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const setCookie = res.headers['set-cookie'] as string[] | string | undefined;
  if (!setCookie) throw new Error('signIn: no Set-Cookie header');
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find((c) => c.startsWith('better-auth.session_token'));
  if (!sessionCookie) throw new Error('signIn: no session_token cookie found');
  return sessionCookie.split(';')[0]!;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe.skipIf(!hasDatabase())('Statistics endpoints e2e', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let auth: Auth;

  let sysadminCookie: string;
  let regularUserCookie: string;

  let orgId: string;
  let rankId: string;
  let studentUserId: string;

  beforeAll(async () => {
    await resetDatabase();

    const built = await buildTestApp();
    app = built.app;
    close = built.close;
    db = app.get<DrizzleDb>(DRIZZLE);
    auth = app.get<Auth>(BETTER_AUTH);

    // 1. Sysadmin actor, signed in.
    const sysadminEmail = `e2e-stats-sysadmin-${Date.now()}@example.com`;
    await createUser(auth, db, {
      email: sysadminEmail,
      password: 'Test-Pass-1!',
      name: 'E2E Stats Sysadmin',
      role: 'sysadmin',
    });
    sysadminCookie = await signIn(app, sysadminEmail, 'Test-Pass-1!');

    // 2. A regular (non-sysadmin) caller, for the 403 case.
    const regularEmail = `e2e-stats-user-${Date.now()}@example.com`;
    await createUser(auth, db, {
      email: regularEmail,
      password: 'Test-Pass-2!',
      name: 'E2E Stats Regular User',
    });
    regularUserCookie = await signIn(app, regularEmail, 'Test-Pass-2!');

    // 3. One organisation with no parent.
    const [orgRow] = await db
      .insert(organisations)
      .values({
        type: 'club',
        shortCode: `STATS-${Date.now()}`,
        country: 'FI',
        nameEn: 'Stats Test Club',
        nameSv: 'Stats Test Club SV',
        nameFi: 'Stats Test Club FI',
      })
      .returning({ id: organisations.id });
    orgId = orgRow!.id;

    // 4. A belt system + one rank, so the rank-count aggregate has a rank
    //    to reference.
    const [systemRow] = await db
      .insert(beltSystems)
      .values({
        code: `STATS-SYS-${Date.now()}`,
        nameEn: 'Stats Test System',
        nameSv: 'Stats Test System SV',
        nameFi: 'Stats Test System FI',
        sortOrder: 99,
      })
      .returning({ id: beltSystems.id });
    const systemId = systemRow!.id;

    const [rankRow] = await db
      .insert(beltRanks)
      .values({
        systemId,
        level: 1,
        sortOrder: 1,
        nameRomaji: 'Jukyu',
        nameEn: '9th Kyu',
        nameSv: '9th Kyu SV',
        nameFi: '9th Kyu FI',
        beltColor: 'white',
      })
      .returning({ id: beltRanks.id });
    rankId = rankRow!.id;

    // 5. A student user, membered in the org...
    const studentEmail = `e2e-stats-student-${Date.now()}@example.com`;
    studentUserId = await createUser(auth, db, {
      email: studentEmail,
      password: 'Test-Pass-3!',
      name: 'Stats Test Student',
    });
    await db.insert(organisationMembership).values({
      userId: studentUserId,
      organisationId: orgId,
      role: 'student',
    });

    // ...then a PASS rank_history row promoting them to the seeded rank.
    // Membership must be inserted BEFORE rank_history: `apply_rank_delta`
    // (fired by the rank_history AFTER-trigger) attributes the rank_count
    // delta to whatever `organisation_membership` rows already exist for
    // the user at insert time.
    await db.insert(rankHistory).values({
      userId: studentUserId,
      rankId,
      date: '2026-01-01',
      result: 'pass',
      source: 'external',
      recordedByUserId: studentUserId,
    });
  });

  afterAll(async () => {
    await close?.();
  });

  it('GET /api/statistics/organisation/:id as sysadmin -> 200 with seeded membership + rank counts', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/statistics/organisation/${orgId}`)
      .set('Cookie', sysadminCookie);

    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ type: 'organisation', id: orgId, name: 'Stats Test Club' });
    expect(res.body.metrics.membershipCount.student).toBe(1);

    const rankRow = (res.body.ranks as Array<{ rank: { id: string }; count: number }>).find(
      (r) => r.rank.id === rankId,
    );
    expect(rankRow).toBeDefined();
    expect(rankRow?.count).toBe(1);
  });

  it('POST /api/admin/statistics/rebuild as sysadmin -> 200 { ok: true, durationMs }', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/statistics/rebuild')
      .set('Cookie', sysadminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, durationMs: expect.any(Number) });
  });

  it('GET /api/statistics/platform as a non-sysadmin caller -> 403 FORBIDDEN', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/statistics/platform')
      .set('Cookie', regularUserCookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(typeof res.body.error.message).toBe('string');
  });
});
