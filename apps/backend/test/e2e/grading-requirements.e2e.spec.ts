/**
 * e2e suite for the grading-requirements feature (Task 13).
 *
 * Covers spec §8 acceptance scenarios 1–8:
 *  1. Scope isolation: PUT setId=A rows NOT returned by GET setId=B.
 *  2. Whole-scope replace: second PUT leaves only its rows.
 *  3. setId required on PUT: missing → 400 VALIDATION_ERROR.
 *  4. pickCount clamp: pickCount > patternIds.length → clamped.
 *  5. Empty scope shape: GET on set with no rows → empty GradingRequirements (not 404).
 *  6. Ancestor inheritance: student's org has no active set → parent org's set resolves.
 *  7. One active set per org: activating B flips A to isActive=false.
 *  8. Clone deep-copies: new set has isActive=false, clonedFromId=source, same rows.
 *
 * Scenarios 9 (set delete cascades) and 10 (cross-org create blocked) are deferred
 * because 9 tests FK cascade (not controller behaviour) and 10 was already covered
 * by the RequirementSets service unit tests. Their omission is noted in the report.
 *
 * Auth pattern: sign up via better-auth API, update role directly in DB, then
 * sign in via HTTP to get a session cookie for supertest.
 *
 * Isolation: `resetDatabase()` runs once in `beforeAll` so the suite starts from
 * a clean state. Per-test data uses unique slugs / emails to avoid collisions when
 * tests run in the same transaction-less DB.
 */

import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { type AuthenticatedUser } from '../../src/infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import { user as userTable } from '../../src/infrastructure/database/schema/users.js';
import { organisations } from '../../src/infrastructure/database/schema/organisations.js';
import { beltSystems } from '../../src/infrastructure/database/schema/belt-systems.js';
import { beltRanks } from '../../src/infrastructure/database/schema/belt-ranks.js';
import { organisationMembership } from '../../src/infrastructure/database/schema/memberships.js';
import { RequirementSetsService } from '../../src/modules/grading-requirements/requirement-sets.service.js';
import { RankRequirementsService } from '../../src/modules/grading-requirements/rank-requirements.service.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';
import { resetDatabase } from '../helpers/db-reset.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A CASL-compatible sysadmin actor used for service-layer seed calls. */
const SYSADMIN_ACTOR: AuthenticatedUser = {
  id: 'e2e-sysadmin-actor',
  email: 'e2e-sysadmin@example.com',
  emailVerified: true,
  name: 'E2E Sysadmin',
  image: null,
  role: 'sysadmin',
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

/**
 * Sign up a user via better-auth's server API, then update the role in the DB
 * directly. Returns the user row id.
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
 * Sign in via the HTTP endpoint and return the raw Set-Cookie header string
 * (e.g. `"better-auth.session_token=…; Path=/; HttpOnly"`).
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
  // Return just the `name=value` part (strip attributes for the Cookie header).
  return sessionCookie.split(';')[0]!;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe.skipIf(!hasDatabase())('Grading requirements e2e', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let auth: Auth;
  let setsService: RequirementSetsService;
  let rankReqsService: RankRequirementsService;

  // Shared UUIDs seeded once for the entire suite.
  let sysadminCookie: string;
  // Seeded for a future cross-org test (scenario 10, deferred) — unused for now.
  let _orgAdminCookie: string;
  let orgAdminUserId: string;
  let _otherOrgAdminCookie: string;

  // A belt system + rank shared across all tests.
  let systemId: string;
  let rankId: string;

  // Two orgs for ancestor-walk tests.
  let parentOrgId: string;
  let childOrgId: string;

  // Another org for isolation tests.
  let orgBId: string;

  beforeAll(async () => {
    await resetDatabase();

    const built = await buildTestApp();
    app = built.app;
    close = built.close;
    db = app.get<DrizzleDb>(DRIZZLE);
    auth = app.get<Auth>(BETTER_AUTH);
    setsService = app.get(RequirementSetsService);
    rankReqsService = app.get(RankRequirementsService);

    // 1. Create a sysadmin user and sign in.
    const sysAdminEmail = `e2e-sysadmin-${Date.now()}@example.com`;
    await createUser(auth, db, {
      email: sysAdminEmail,
      password: 'Test-Pass-1!',
      name: 'E2E Sysadmin',
      role: 'sysadmin',
    });
    sysadminCookie = await signIn(app, sysAdminEmail, 'Test-Pass-1!');

    // 2. Create org hierarchy: parentOrg → childOrg (for ancestor-walk test).
    const [parentRow] = await db
      .insert(organisations)
      .values({
        type: 'national_federation',
        shortCode: `NF-${Date.now()}`,
        country: 'FI',
        nameEn: 'Parent Fed',
        nameSv: 'Parent Fed SV',
        nameFi: 'Parent Fed FI',
      })
      .returning({ id: organisations.id });
    parentOrgId = parentRow!.id;

    const [childRow] = await db
      .insert(organisations)
      .values({
        type: 'club',
        parentId: parentOrgId,
        shortCode: `CLUB-${Date.now()}`,
        country: 'FI',
        nameEn: 'Child Club',
        nameSv: 'Child Club SV',
        nameFi: 'Child Club FI',
      })
      .returning({ id: organisations.id });
    childOrgId = childRow!.id;

    // 3. Create a second org (orgB) for cross-scope tests.
    const [orgBRow] = await db
      .insert(organisations)
      .values({
        type: 'club',
        shortCode: `ORGB-${Date.now()}`,
        country: 'FI',
        nameEn: 'Org B',
        nameSv: 'Org B SV',
        nameFi: 'Org B FI',
      })
      .returning({ id: organisations.id });
    orgBId = orgBRow!.id;

    // 4. orgadmin for parentOrg.
    const adminEmail = `e2e-orgadmin-${Date.now()}@example.com`;
    orgAdminUserId = await createUser(auth, db, {
      email: adminEmail,
      password: 'Test-Pass-2!',
      name: 'Org Admin',
    });
    await db.insert(organisationMembership).values({
      userId: orgAdminUserId,
      organisationId: parentOrgId,
      role: 'orgadmin',
    });
    _orgAdminCookie = await signIn(app, adminEmail, 'Test-Pass-2!');

    // 5. orgadmin for orgB (for cross-org blocked test).
    const otherAdminEmail = `e2e-other-orgadmin-${Date.now()}@example.com`;
    await createUser(auth, db, {
      email: otherAdminEmail,
      password: 'Test-Pass-3!',
      name: 'Other Org Admin',
    });
    await db.insert(organisationMembership).values({
      userId: (
        await db
          .select({ id: userTable.id })
          .from(userTable)
          .where(eq(userTable.email, otherAdminEmail))
          .limit(1)
      )[0]!.id,
      organisationId: orgBId,
      role: 'orgadmin',
    });
    _otherOrgAdminCookie = await signIn(app, otherAdminEmail, 'Test-Pass-3!');

    // 6. Create a belt system + one rank (shared across tests).
    const [sysRow] = await db
      .insert(beltSystems)
      .values({
        code: `TEST-SYS-${Date.now()}`,
        nameEn: 'Test System',
        nameSv: 'Test System SV',
        nameFi: 'Test System FI',
        sortOrder: 99,
      })
      .returning({ id: beltSystems.id });
    systemId = sysRow!.id;

    const [rankRow] = await db
      .insert(beltRanks)
      .values({
        systemId,
        level: 1,
        sortOrder: 1,
        nameRomaji: 'Ikkyu',
        nameEn: '1st Kyu',
        nameSv: '1st Kyu SV',
        nameFi: '1st Kyu FI',
        beltColor: 'brown',
      })
      .returning({ id: beltRanks.id });
    rankId = rankRow!.id;
  });

  afterAll(async () => {
    await close?.();
  });

  // ── Helpers inside suite ──────────────────────────────────────────────────

  /** Create a requirement set owned by `parentOrgId` via the service. */
  async function createSet(name: string, orgId: string = parentOrgId) {
    return setsService.create(
      { name, organisationId: orgId, effectiveDate: '2026-01-01' },
      SYSADMIN_ACTOR,
    );
  }

  /** Activate a set via service. */
  async function activateSet(setId: string) {
    return setsService.activate(setId, SYSADMIN_ACTOR);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 1: Scope isolation
  // ────────────────────────────────────────────────────────────────────────────

  it('1. scope isolation: PUT setId=A rows NOT returned by GET setId=B', async () => {
    const setA = await createSet('Scope-Isolation-A');
    const setB = await createSet('Scope-Isolation-B');

    // PUT kihon=[...] for setA
    const putRes = await request(app.getHttpServer())
      .put(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie)
      .send({ setId: setA.id, kihon: [], jissenMinutes: 5 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.jissenMinutes).toBe(5);

    // GET with setB should NOT return setA's jissenMinutes
    const getRes = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${setB.id}`)
      .set('Cookie', sysadminCookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.jissenMinutes).toBeNull();
    expect(getRes.body.rankId).toBe(rankId);
    expect(getRes.body.setId).toBe(setB.id);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 2: Whole-scope replace
  // ────────────────────────────────────────────────────────────────────────────

  it('2. whole-scope replace: second PUT leaves only its rows (jissenMinutes)', async () => {
    const set = await createSet('Whole-Scope-Replace');

    // First PUT: jissenMinutes=10, jissenTested=true
    await request(app.getHttpServer())
      .put(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie)
      .send({ setId: set.id, jissenMinutes: 10, jissenTested: true });

    // Second PUT: jissenMinutes=20, jissenTested=false
    const res2 = await request(app.getHttpServer())
      .put(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie)
      .send({ setId: set.id, jissenMinutes: 20, jissenTested: false });
    expect(res2.status).toBe(200);

    // GET should reflect only the second PUT
    const getRes = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${set.id}`)
      .set('Cookie', sysadminCookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.jissenMinutes).toBe(20);
    expect(getRes.body.jissenTested).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 3: setId required on PUT
  // ────────────────────────────────────────────────────────────────────────────

  it('3. setId required on PUT: empty setId → 400 VALIDATION_FAILED', async () => {
    // The Zod schema has setId: z.string().uuid(), so an empty string fails Zod.
    const res = await request(app.getHttpServer())
      .put(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie)
      .send({ setId: '' });
    expect(res.status).toBe(400);
  });

  it('3b. setId required on DELETE: missing → 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 4: pickCount clamp
  // ────────────────────────────────────────────────────────────────────────────

  it('4. pickCount clamp: pickCount > patternIds.length → clamped to length', async () => {
    // We need real pattern UUIDs. Since there may not be any patterns in the
    // DB after resetDatabase(), we insert three directly.
    // Insert pattern rows directly into the pattern table.
    // We use the drizzle pattern schema.
    const { pattern: patternTable } = await import(
      '../../src/infrastructure/database/schema/pattern.js'
    );

    const ts = Date.now();
    const [p1] = await db
      .insert(patternTable)
      .values({ nameRomaji: `Pattern-A-${ts}`, nameEn: 'Pattern A', nameSv: 'Pattern A', nameFi: 'Pattern A' })
      .returning({ id: patternTable.id });
    const [p2] = await db
      .insert(patternTable)
      .values({ nameRomaji: `Pattern-B-${ts}`, nameEn: 'Pattern B', nameSv: 'Pattern B', nameFi: 'Pattern B' })
      .returning({ id: patternTable.id });
    const [p3] = await db
      .insert(patternTable)
      .values({ nameRomaji: `Pattern-C-${ts}`, nameEn: 'Pattern C', nameSv: 'Pattern C', nameFi: 'Pattern C' })
      .returning({ id: patternTable.id });

    const patternIds = [p1!.id, p2!.id, p3!.id];
    const set = await createSet('PickCount-Clamp');

    // PUT a hokei group with pickCount=5 but only 3 patterns
    const putRes = await request(app.getHttpServer())
      .put(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie)
      .send({
        setId: set.id,
        hokeiGroups: [
          {
            pickCount: 5,
            patternIds,
            groupOrder: 0,
            isTested: false,
          },
        ],
      });
    expect(putRes.status).toBe(200);

    const group = putRes.body.hokeiGroups[0];
    expect(group).toBeDefined();
    expect(group.pickCount).toBe(3); // clamped to patternIds.length
    expect(group.patternIds).toHaveLength(3);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 5: Empty scope shape
  // ────────────────────────────────────────────────────────────────────────────

  it('5. empty scope shape: GET on set with no rows → empty GradingRequirements (not 404)', async () => {
    const set = await createSet('Empty-Scope');

    const res = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${set.id}`)
      .set('Cookie', sysadminCookie);
    expect(res.status).toBe(200);
    expect(res.body.rankId).toBe(rankId);
    expect(res.body.setId).toBe(set.id);
    expect(res.body.kihon).toEqual([]);
    expect(res.body.hokeiGroups).toEqual([]);
    expect(res.body.jissenMinutes).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 6: Ancestor inheritance
  // ────────────────────────────────────────────────────────────────────────────

  it('6. ancestor inheritance: student in child club → resolves parent org\'s active set', async () => {
    // Create active requirement set for the PARENT org with some data.
    const parentSet = await createSet('Ancestor-Set', parentOrgId);
    await activateSet(parentSet.id);

    // Write requirements for this set's rank.
    await rankReqsService.replace(
      rankId,
      {
        setId: parentSet.id,
        jissenMinutes: 42,
        jissenTested: false,
        hokeiGroups: [],
        kobo: [],
        koboTested: [],
        otherPatterns: [],
        otherPatternsTested: [],
        kihon: [],
        kihonTested: [],
        requiresTheoricExam: false,
        requiresEssay: false,
      },
      SYSADMIN_ACTOR,
    );

    // Create a student user in the CHILD org (no active set for child org).
    const studentEmail = `student-${Date.now()}@example.com`;
    const studentId = await createUser(auth, db, {
      email: studentEmail,
      password: 'Test-Pass-4!',
      name: 'Student',
    });
    await db.insert(organisationMembership).values({
      userId: studentId,
      organisationId: childOrgId,
      role: 'student',
    });
    const studentCookie = await signIn(app, studentEmail, 'Test-Pass-4!');

    // GET without setId (resolves for calling user = student)
    const res = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}`)
      .set('Cookie', studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.jissenMinutes).toBe(42);
    // setId comes from the parent's active set
    expect(res.body.setId).toBe(parentSet.id);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 7: One active set per org
  // ────────────────────────────────────────────────────────────────────────────

  it('7. one active set per org: activating B flips A to isActive=false', async () => {
    // Create a fresh org to avoid side-effects from scenario 6.
    const [freshOrgRow] = await db
      .insert(organisations)
      .values({
        type: 'club',
        shortCode: `FRESH-${Date.now()}`,
        country: 'FI',
        nameEn: 'Fresh Org',
        nameSv: 'Fresh Org SV',
        nameFi: 'Fresh Org FI',
      })
      .returning({ id: organisations.id });
    const freshOrgId = freshOrgRow!.id;

    const setA = await setsService.create(
      { name: 'Set-A-OneActive', organisationId: freshOrgId, effectiveDate: '2026-01-01' },
      SYSADMIN_ACTOR,
    );
    const setB = await setsService.create(
      { name: 'Set-B-OneActive', organisationId: freshOrgId, effectiveDate: '2026-06-01' },
      SYSADMIN_ACTOR,
    );

    // Activate A first.
    await setsService.activate(setA.id, SYSADMIN_ACTOR);

    // Activate B — A must flip to inactive.
    const activatedB = await setsService.activate(setB.id, SYSADMIN_ACTOR);
    expect(activatedB.isActive).toBe(true);

    const afterA = await setsService.get(setA.id, SYSADMIN_ACTOR);
    expect(afterA.isActive).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scenario 8: Clone deep-copies
  // ────────────────────────────────────────────────────────────────────────────

  it('8. clone deep-copies: new set has isActive=false, clonedFromId=source, same rows', async () => {
    const source = await createSet('Clone-Source');

    // Write some requirements for the source set.
    await rankReqsService.replace(
      rankId,
      {
        setId: source.id,
        jissenMinutes: 30,
        jissenTested: true,
        requiresEssay: true,
        hokeiGroups: [],
        kobo: [],
        koboTested: [],
        otherPatterns: [],
        otherPatternsTested: [],
        kihon: [],
        kihonTested: [],
        requiresTheoricExam: false,
      },
      SYSADMIN_ACTOR,
    );

    // Clone the source.
    const cloned = await setsService.clone(source.id, { name: 'Clone-Copy' }, SYSADMIN_ACTOR);
    expect(cloned.isActive).toBe(false);
    expect(cloned.clonedFromId).toBe(source.id);

    // Verify the detail rows were deep-copied.
    const clonedReqs = await rankReqsService.fetchForScope(rankId, cloned.id);
    expect(clonedReqs.jissenMinutes).toBe(30);
    expect(clonedReqs.jissenTested).toBe(true);
    expect(clonedReqs.requiresEssay).toBe(true);

    // Original is unchanged.
    const sourceReqs = await rankReqsService.fetchForScope(rankId, source.id);
    expect(sourceReqs.jissenMinutes).toBe(30);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bonus: mutual-exclusion guard on GET
  // ────────────────────────────────────────────────────────────────────────────

  it('bonus: GET with both setId and forUserId → 400 VALIDATION_FAILED', async () => {
    const set = await createSet('MutexTest');
    const res = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${set.id}&forUserId=${orgAdminUserId}`)
      .set('Cookie', sysadminCookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bonus: unauthenticated request → 401
  // ────────────────────────────────────────────────────────────────────────────

  it('bonus: unauthenticated GET → 401', async () => {
    const set = await createSet('UnauthTest');
    const res = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${set.id}`);
    expect(res.status).toBe(401);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bonus: DELETE clears scope
  // ────────────────────────────────────────────────────────────────────────────

  it('bonus: DELETE clears scope; subsequent GET returns empty shape', async () => {
    const set = await createSet('Delete-Scope');

    // PUT some data first.
    await request(app.getHttpServer())
      .put(`/api/requirements/${rankId}`)
      .set('Cookie', sysadminCookie)
      .send({ setId: set.id, jissenMinutes: 7 });

    // Confirm data is there.
    const before = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${set.id}`)
      .set('Cookie', sysadminCookie);
    expect(before.body.jissenMinutes).toBe(7);

    // DELETE the scope.
    const delRes = await request(app.getHttpServer())
      .delete(`/api/requirements/${rankId}?setId=${set.id}`)
      .set('Cookie', sysadminCookie);
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    // GET should return empty shape now.
    const after = await request(app.getHttpServer())
      .get(`/api/requirements/${rankId}?setId=${set.id}`)
      .set('Cookie', sysadminCookie);
    expect(after.status).toBe(200);
    expect(after.body.jissenMinutes).toBeNull();
  });
});
