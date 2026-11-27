import { type NestExpressApplication } from '@nestjs/platform-express';
import { TrainingGoalSchema, TrainingSessionSchema } from '@repo/contracts/training-log';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  featureFlag,
  technique,
  trainingSessions,
  userContentProgress,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * The training log and personal goals against the real app and database:
 * flag gating, privacy between users, and the "last practised" side effect.
 */

const PASSWORD = 'training-e2e-password-123';
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
const MISSING = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!hasDatabase())('Training log (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let alice: request.Agent;
  let bob: request.Agent;
  const stamp = Date.now();
  const userIds: string[] = [];
  let aliceId: string;
  let techniqueId: string;

  const setFlag = (enabled: boolean) =>
    db
      .insert(featureFlag)
      .values({ code: 'training-log', enabled })
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled } });

  const signedIn = async (name: string): Promise<{ agent: request.Agent; id: string }> => {
    const email = `training-${name}-${stamp}@example.com`;
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email, password: PASSWORD, name } });
    userIds.push(created.user.id);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD });
    return { agent, id: created.user.id };
  };

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    ({ agent: alice, id: aliceId } = await signedIn('alice'));
    ({ agent: bob } = await signedIn('bob'));
    const [row] = await db
      .insert(technique)
      .values({ nameRomaji: `training-e2e-${stamp}` })
      .returning({ id: technique.id });
    techniqueId = row!.id;
  });

  afterAll(async () => {
    await setFlag(false);
    if (userIds.length > 0) await db.delete(userTable).where(inArray(userTable.id, userIds));
    if (techniqueId) await db.delete(technique).where(eq(technique.id, techniqueId));
    await close();
  });

  it('answers 404 while the flag is off', async () => {
    await setFlag(false);
    await alice.get('/api/training-sessions').expect(404);
    await alice.get('/api/training-goals/me').expect(404);
  });

  it('logs a session and moves "last practised" up on its items', async () => {
    await setFlag(true);
    const res = await alice
      .post('/api/training-sessions')
      .send({
        date: '2026-11-20',
        kind: 'club',
        durationMinutes: 90,
        items: [{ contentType: 'technique', contentId: techniqueId }],
      })
      .expect(201);
    const session = TrainingSessionSchema.parse(res.body);
    expect(session.items).toEqual([{ contentType: 'technique', contentId: techniqueId }]);

    const [progress] = await db
      .select()
      .from(userContentProgress)
      .where(
        and(
          eq(userContentProgress.userId, aliceId),
          eq(userContentProgress.techniqueId, techniqueId),
        ),
      );
    expect(progress).toMatchObject({ status: 'learning', lastPracticedAt: '2026-11-20' });

    // An older session does not move the date back.
    await alice
      .post('/api/training-sessions')
      .send({
        date: '2026-11-01',
        kind: 'own',
        items: [{ contentType: 'technique', contentId: techniqueId }],
      })
      .expect(201);
    const [after] = await db
      .select({ lastPracticedAt: userContentProgress.lastPracticedAt })
      .from(userContentProgress)
      .where(eq(userContentProgress.id, progress!.id));
    expect(after!.lastPracticedAt).toBe('2026-11-20');

    const list = z
      .array(TrainingSessionSchema)
      .parse((await alice.get('/api/training-sessions').expect(200)).body);
    expect(list.map((s) => s.date)).toEqual(['2026-11-20', '2026-11-01']);
    const ranged = (await alice.get('/api/training-sessions?from=2026-11-10').expect(200))
      .body as unknown[];
    expect(ranged).toHaveLength(1);
  });

  it('rejects an item that is not in the catalogue, saving nothing', async () => {
    const before = await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, aliceId));
    await alice
      .post('/api/training-sessions')
      .send({
        date: '2026-11-21',
        kind: 'own',
        items: [{ contentType: 'pattern', contentId: MISSING }],
      })
      .expect(404);
    const after = await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, aliceId));
    expect(after).toHaveLength(before.length);
  });

  it("keeps a user's log private", async () => {
    const [own] = await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.userId, aliceId))
      .limit(1);
    expect((await bob.get('/api/training-sessions').expect(200)).body).toEqual([]);
    await bob
      .put(`/api/training-sessions/${own!.id}`)
      .send({ date: '2026-11-22', kind: 'own' })
      .expect(404);
    await bob.delete(`/api/training-sessions/${own!.id}`).expect(404);

    await alice
      .put(`/api/training-sessions/${own!.id}`)
      .send({ date: '2026-11-22', kind: 'camp', notes: 'x' })
      .expect(200);
    await alice.delete(`/api/training-sessions/${own!.id}`).expect(204);
  });

  it('saves and returns personal goals', async () => {
    expect((await alice.get('/api/training-goals/me').expect(200)).body).toEqual({
      targetRankId: null,
      targetDate: null,
      sessionsPerWeek: null,
    });
    const goal = { targetRankId: null, targetDate: '2027-06-01', sessionsPerWeek: 3 };
    await alice.put('/api/training-goals/me').send(goal).expect(200);
    expect(
      TrainingGoalSchema.parse((await alice.get('/api/training-goals/me').expect(200)).body),
    ).toEqual(goal);
    expect((await bob.get('/api/training-goals/me').expect(200)).body.sessionsPerWeek).toBeNull();

    await alice
      .put('/api/training-goals/me')
      .send({ ...goal, targetRankId: MISSING })
      .expect(404);
  });
});
