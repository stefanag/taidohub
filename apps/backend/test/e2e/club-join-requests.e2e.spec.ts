import { type NestExpressApplication } from '@nestjs/platform-express';
import { AccountExportSchema } from '@repo/contracts/account-export';
import { ClubJoinRequestSchema, JoinableClubSchema } from '@repo/contracts/club-join-requests';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  featureFlag,
  organisationMembership,
  organisations,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Club join requests and the account export against the real app and
 * database: flag gating, who may decide, the membership an approval creates,
 * and the export reflecting it.
 */

const PASSWORD = 'join-e2e-password-123';
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();

describe.skipIf(!hasDatabase())('Club join requests and export (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  const stamp = Date.now();
  const userIds: string[] = [];
  const orgIds: string[] = [];
  const agents = {} as Record<'applicant' | 'other' | 'instructor' | 'outsider', request.Agent>;
  const ids = {} as Record<keyof typeof agents, string>;
  let clubId: string;

  const setFlag = (enabled: boolean) =>
    db
      .insert(featureFlag)
      .values({ code: 'club-join-requests', enabled })
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled } });

  const signIn = async (name: keyof typeof agents) => {
    const email = `join-${name}-${stamp}@example.com`;
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email, password: PASSWORD, name } });
    userIds.push(created.user.id);
    ids[name] = created.user.id;
    agents[name] = request.agent(app.getHttpServer());
    await agents[name]
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD });
  };

  const club = async (code: string) => {
    const [row] = await db
      .insert(organisations)
      .values({
        type: 'club',
        shortCode: `${code}${stamp}`,
        nameEn: code,
        nameSv: code,
        nameFi: code,
      })
      .returning({ id: organisations.id });
    orgIds.push(row!.id);
    return row!.id;
  };

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    for (const name of ['applicant', 'other', 'instructor', 'outsider'] as const)
      await signIn(name);
    clubId = await club('JC');
    const otherClubId = await club('JO');
    await db.insert(organisationMembership).values([
      { userId: ids.instructor, organisationId: clubId, role: 'instructor' },
      { userId: ids.outsider, organisationId: otherClubId, role: 'orgadmin' },
    ]);
  });

  afterAll(async () => {
    await setFlag(false);
    if (userIds.length > 0) await db.delete(userTable).where(inArray(userTable.id, userIds));
    if (orgIds.length > 0) await db.delete(organisations).where(inArray(organisations.id, orgIds));
    await close();
  });

  it('answers 404 while the flag is off', async () => {
    await setFlag(false);
    await agents.applicant.get('/api/club-join-requests/clubs').expect(404);
  });

  it('lets a user without a club ask once, and only the club decides', async () => {
    await setFlag(true);
    const clubs = z
      .array(JoinableClubSchema)
      .parse((await agents.applicant.get('/api/club-join-requests/clubs').expect(200)).body);
    expect(clubs.map((c) => c.id)).toContain(clubId);

    const created = ClubJoinRequestSchema.parse(
      (
        await agents.applicant
          .post('/api/club-join-requests')
          .send({ organisationId: clubId, message: 'Hello' })
          .expect(201)
      ).body,
    );
    expect(created.status).toBe('pending');
    await agents.applicant
      .post('/api/club-join-requests')
      .send({ organisationId: clubId })
      .expect(409);

    // A club member cannot ask, and an orgadmin of another club cannot decide.
    await agents.instructor
      .post('/api/club-join-requests')
      .send({ organisationId: clubId })
      .expect(409);
    expect((await agents.outsider.get('/api/club-join-requests/pending').expect(200)).body).toEqual(
      [],
    );
    await agents.outsider.post(`/api/club-join-requests/${created.id}/approve`).expect(404);

    const pending = z
      .array(ClubJoinRequestSchema)
      .parse((await agents.instructor.get('/api/club-join-requests/pending').expect(200)).body);
    expect(pending.find((p) => p.id === created.id)?.applicant.email).toBe(
      `join-applicant-${stamp}@example.com`,
    );

    const approved = ClubJoinRequestSchema.parse(
      (await agents.instructor.post(`/api/club-join-requests/${created.id}/approve`).expect(200))
        .body,
    );
    expect(approved.status).toBe('approved');
    await agents.instructor.post(`/api/club-join-requests/${created.id}/decline`).expect(409);

    const [membership] = await db
      .select()
      .from(organisationMembership)
      .where(
        and(
          eq(organisationMembership.userId, ids.applicant),
          eq(organisationMembership.organisationId, clubId),
        ),
      );
    expect(membership?.role).toBe('student');

    // Now a member: no further requests.
    await agents.applicant
      .post('/api/club-join-requests')
      .send({ organisationId: clubId })
      .expect(409);
  });

  it('lets the club decline and the applicant cancel', async () => {
    const first = (
      await agents.other
        .post('/api/club-join-requests')
        .send({ organisationId: clubId })
        .expect(201)
    ).body as {
      id: string;
    };
    expect(
      (await agents.instructor.post(`/api/club-join-requests/${first.id}/decline`).expect(200)).body
        .status,
    ).toBe('declined');

    const second = (
      await agents.other
        .post('/api/club-join-requests')
        .send({ organisationId: clubId })
        .expect(201)
    ).body as {
      id: string;
    };
    await agents.applicant.delete(`/api/club-join-requests/${second.id}`).expect(404);
    await agents.other.delete(`/api/club-join-requests/${second.id}`).expect(204);
    await agents.other.delete(`/api/club-join-requests/${second.id}`).expect(409);

    const mine = (await agents.other.get('/api/club-join-requests/mine').expect(200)).body as {
      status: string;
    }[];
    expect(mine.map((m) => m.status).sort()).toEqual(['cancelled', 'declined']);
  });

  it("exports the user's own data, including the new membership", async () => {
    const res = await agents.applicant.get('/api/account/export').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const data = AccountExportSchema.parse(res.body);
    expect(data.account.id).toBe(ids.applicant);
    expect(data.memberships.map((m) => m.organisationId)).toEqual([clubId]);
    expect(data.trainingSessions).toEqual([]);
  });
});
