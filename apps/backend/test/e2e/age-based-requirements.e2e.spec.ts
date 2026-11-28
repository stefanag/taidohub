/**
 * Age-based grading requirements against the real app and database
 * (plan 2026-11-28-age-based-grading-requirements): the federation's age
 * basis, age groups and variants on a kyu rank, the refusal on a mon rank,
 * per-student resolution, and the snapshot on a verified grading.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { GradingRequirementsSchema } from '@repo/contracts/grading-requirements';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type AuthenticatedUser } from '../../src/infrastructure/auth/auth.types.js';
import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { UserContextService } from '../../src/infrastructure/auth/user-context.service.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  beltRanks,
  beltSystems,
  featureFlag,
  organisationMembership,
  organisations,
  rankHistory,
  requirementSet,
  userProfile,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { OrganisationsService } from '../../src/modules/organisations/organisations.service.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

const PASSWORD = 'age-req-e2e-password-1';
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();

describe.skipIf(!hasDatabase())('Age-based grading requirements (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  const stamp = Date.now();
  const userIds: string[] = [];
  const orgIds: string[] = [];
  const createdSystems: string[] = [];
  const agents = {} as Record<
    'sysadmin' | 'fedAdmin' | 'clubAdmin' | 'young' | 'teen',
    request.Agent
  >;
  const ids = {} as Record<keyof typeof agents, string>;
  let federationId: string;
  let clubId: string;
  let setId: string;
  let kyuRankId: string;
  let monRankId: string;

  const signUp = async (name: keyof typeof agents) => {
    const email = `age-${name}-${stamp}@example.com`;
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email, password: PASSWORD, name } });
    userIds.push(created.user.id);
    ids[name] = created.user.id;
    if (name === 'sysadmin')
      await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, created.user.id));
  };

  /** Signs in after memberships exist, so the session carries them. */
  const signIn = async (name: keyof typeof agents) => {
    agents[name] = request.agent(app.getHttpServer());
    const res = await agents[name]
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: `age-${name}-${stamp}@example.com`, password: PASSWORD });
    if (res.status !== 200)
      throw new Error(`sign-in ${name}: ${res.status} ${JSON.stringify(res.body)}`);
  };

  /** A belt system by code, reusing a seeded one (the code is unique). */
  const system = async (code: string) => {
    const [existing] = await db.select().from(beltSystems).where(eq(beltSystems.code, code));
    if (existing) return existing.id;
    const [row] = await db
      .insert(beltSystems)
      .values({ code, nameEn: code, nameSv: code, nameFi: code })
      .returning({ id: beltSystems.id });
    createdSystems.push(row!.id);
    return row!.id;
  };

  const rank = async (systemId: string, level: number, name: string) => {
    const [row] = await db
      .insert(beltRanks)
      .values({
        systemId,
        organisationId: federationId,
        level,
        nameRomaji: name,
        nameEn: name,
        beltColor: 'white',
      })
      .returning({ id: beltRanks.id });
    return row!.id;
  };

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    const [fed] = await db
      .insert(organisations)
      .values({
        type: 'national_federation',
        shortCode: `AF${stamp}`,
        country: 'SWE',
        nameEn: 'F',
        nameSv: 'F',
        nameFi: 'F',
      })
      .returning({ id: organisations.id });
    federationId = fed!.id;
    const [club] = await db
      .insert(organisations)
      .values({
        type: 'club',
        parentId: federationId,
        shortCode: `AC${stamp}`,
        country: 'SWE',
        nameEn: 'C',
        nameSv: 'C',
        nameFi: 'C',
      })
      .returning({ id: organisations.id });
    clubId = club!.id;
    orgIds.push(clubId, federationId);

    const names = ['sysadmin', 'fedAdmin', 'clubAdmin', 'young', 'teen'] as const;
    for (const name of names) await signUp(name);
    await db.insert(organisationMembership).values([
      { userId: ids.fedAdmin, organisationId: federationId, role: 'orgadmin' },
      { userId: ids.clubAdmin, organisationId: clubId, role: 'orgadmin' },
      { userId: ids.young, organisationId: clubId, role: 'student' },
      { userId: ids.teen, organisationId: clubId, role: 'student' },
    ]);
    await db.insert(userProfile).values([
      { userId: ids.young, dateOfBirth: '2016-12-31' },
      { userId: ids.teen, dateOfBirth: '2012-03-01' },
    ]);
    for (const name of names) await signIn(name);

    kyuRankId = await rank(await system('kyu'), 900 + (stamp % 50), `Test kyu ${stamp}`);
    monRankId = await rank(await system('mon'), 900 + (stamp % 50), `Test mon ${stamp}`);

    const [set] = await db
      .insert(requirementSet)
      .values({
        name: `Age set ${stamp}`,
        organisationId: federationId,
        effectiveDate: '2026-01-01',
        isActive: true,
      })
      .returning({ id: requirementSet.id });
    setId = set!.id;
  });

  afterAll(async () => {
    await db
      .update(featureFlag)
      .set({ enabled: false })
      .where(inArray(featureFlag.code, ['grading-history', 'grading-history-verification']));
    await db.delete(rankHistory).where(inArray(rankHistory.userId, userIds));
    if (setId) await db.delete(requirementSet).where(eq(requirementSet.id, setId));
    await db.delete(beltRanks).where(inArray(beltRanks.id, [kyuRankId, monRankId].filter(Boolean)));
    if (createdSystems.length)
      await db.delete(beltSystems).where(inArray(beltSystems.id, createdSystems));
    await db.delete(userTable).where(inArray(userTable.id, userIds));
    await db.delete(organisations).where(inArray(organisations.id, orgIds));
    await close();
  });

  /**
   * Through the service inside a bound user context: the organisations HTTP
   * routes read the request-scoped ability, which this test harness does not
   * bind (no organisations e2e exists for the same reason).
   */
  it("lets the federation's orgadmin choose the age basis, not a club's", async () => {
    const orgs = app.get(OrganisationsService);
    const ctx = app.get(UserContextService);
    const actor = (id: string, organisationId: string): AuthenticatedUser => ({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name: null,
      image: null,
      role: 'user',
      locale: 'en',
      deactivatedAt: null,
      memberships: [{ organisationId, role: 'orgadmin' }],
    });
    const clubAdmin = actor(ids.clubAdmin, clubId);
    const fedAdmin = actor(ids.fedAdmin, federationId);

    await expect(
      ctx.run(clubAdmin, () =>
        orgs.update(federationId, { gradingAgeBasis: 'age_reached_in_grading_year' }, clubAdmin),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      ctx.run(clubAdmin, () =>
        orgs.update(clubId, { gradingAgeBasis: 'age_reached_in_grading_year' }, clubAdmin),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const updated = await ctx.run(fedAdmin, () =>
      orgs.update(federationId, { gradingAgeBasis: 'age_reached_in_grading_year' }, fedAdmin),
    );
    expect(updated.gradingAgeBasis).toBe('age_reached_in_grading_year');
  });

  it('needs a base requirement, refuses mon ranks and overlapping groups', async () => {
    await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}/age-groups`)
      .send({ setId, groups: [{ ageFrom: null, ageTo: 11 }] })
      .expect(400);

    await agents.fedAdmin
      .put(`/api/requirements/${monRankId}`)
      .send({ setId, jissenMinutes: 5 })
      .expect(200);
    const mon = await agents.fedAdmin
      .put(`/api/requirements/${monRankId}/age-groups`)
      .send({ setId, groups: [{ ageFrom: null, ageTo: 11 }] })
      .expect(400);
    expect(mon.body.error.code).toBe('AGE_GROUPS_NOT_ALLOWED');

    await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}`)
      .send({ setId, jissenMinutes: 60 })
      .expect(200);
    const overlap = await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}/age-groups`)
      .send({
        setId,
        groups: [
          { ageFrom: null, ageTo: 12 },
          { ageFrom: 12, ageTo: 15 },
        ],
      })
      .expect(400);
    expect(overlap.body.error.code).toBe('AGE_GROUPS_OVERLAP');
  });

  it('gives each student the variant for their age', async () => {
    const groupsRes = await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}/age-groups`)
      .send({
        setId,
        groups: [
          { ageFrom: null, ageTo: 11 },
          { ageFrom: 12, ageTo: 15 },
        ],
      })
      .expect(200);
    const base = GradingRequirementsSchema.parse(groupsRes.body);
    expect(base.ageGroups).toHaveLength(2);
    const [youngGroup, teenGroup] = base.ageGroups;

    // A new variant starts as a copy of the base; then the teen variant is changed.
    const copied = await agents.fedAdmin.get(
      `/api/requirements/${kyuRankId}?setId=${setId}&ageGroupId=${teenGroup!.id}`,
    );
    expect(copied.body.jissenMinutes).toBe(60);
    await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}`)
      .send({ setId, ageGroupId: teenGroup!.id, jissenMinutes: 30 })
      .expect(200);
    await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}`)
      .send({ setId, ageGroupId: youngGroup!.id, jissenMinutes: 10 })
      .expect(200);

    // Birth-year counting (set above): born 2016-12-31 is 10 in 2026; born 2012-03-01 is 14.
    const young = GradingRequirementsSchema.parse(
      (await agents.young.get(`/api/requirements/${kyuRankId}`).expect(200)).body,
    );
    expect(young).toMatchObject({ ageBasis: 'age_reached_in_grading_year', jissenMinutes: 10 });
    expect(young.ageGroup?.id).toBe(youngGroup!.id);

    const teen = GradingRequirementsSchema.parse(
      (await agents.teen.get(`/api/requirements/${kyuRankId}`).expect(200)).body,
    );
    expect(teen.jissenMinutes).toBe(30);
    expect(teen.ageGroup?.id).toBe(teenGroup!.id);

    // The club admin sees a student's variant too, and the base is unchanged.
    expect(
      (
        await agents.clubAdmin
          .get(`/api/requirements/${kyuRankId}?forUserId=${ids.teen}`)
          .expect(200)
      ).body.jissenMinutes,
    ).toBe(30);
    expect(
      (await agents.fedAdmin.get(`/api/requirements/${kyuRankId}?setId=${setId}`).expect(200)).body
        .jissenMinutes,
    ).toBe(60);
  });

  it('records the variant on a verified grading and clears it on unverify', async () => {
    await db
      .insert(featureFlag)
      .values([
        { code: 'grading-history', enabled: true },
        { code: 'grading-history-verification', enabled: true },
      ])
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled: true } });
    const created = await agents.teen
      .post(`/api/rank-history/${ids.teen}`)
      .send({ rankId: kyuRankId, date: '2026-05-01' })
      .expect(201);
    expect(created.body.judgedAgainst).toBeNull();

    const verified = await agents.sysadmin
      .post(`/api/rank-history/${created.body.id}/verify`)
      .expect(201);
    expect(verified.body.judgedAgainst).toMatchObject({
      requirementSetId: setId,
      requirementSetName: `Age set ${stamp}`,
      ageFrom: 12,
      ageTo: 15,
      ageBasis: 'age_reached_in_grading_year',
    });

    const unverified = await agents.sysadmin
      .post(`/api/rank-history/${created.body.id}/unverify`)
      .expect(201);
    expect(unverified.body.judgedAgainst).toBeNull();
  });

  it('removing a group removes its variant; clearing the rank removes everything', async () => {
    const res = await agents.fedAdmin
      .put(`/api/requirements/${kyuRankId}/age-groups`)
      .send({ setId, groups: [] })
      .expect(200);
    expect(res.body.ageGroups).toEqual([]);
    expect(
      (await agents.teen.get(`/api/requirements/${kyuRankId}`).expect(200)).body.jissenMinutes,
    ).toBe(60);

    await agents.fedAdmin.delete(`/api/requirements/${kyuRankId}?setId=${setId}`).expect(200);
  });
});
