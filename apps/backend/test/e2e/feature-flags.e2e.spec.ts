import { type NestExpressApplication } from '@nestjs/platform-express';
import { FeatureFlagSchema } from '@repo/contracts/feature-flags';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import { featureFlag, user as userTable } from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
const PASSWORD = 'flags-e2e-password-123';

describe.skipIf(!hasDatabase())('Feature flag admin (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  const email = `flags-sysadmin-${Date.now()}@example.com`;
  let userId: string;

  beforeAll(async () => {
    ({ app, close } = await buildTestApp());
    db = app.get<DrizzleDb>(DRIZZLE);
    const created = await app
      .get<Auth>(BETTER_AUTH)
      .api.signUpEmail({ body: { email, password: PASSWORD, name: 'Flags Admin' } });
    userId = created.user.id;
    await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, userId));
    await db
      .insert(featureFlag)
      .values({ code: 'instructor-feedback', enabled: false })
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled: false } });
  });

  afterAll(async () => {
    await db.delete(featureFlag).where(eq(featureFlag.code, 'instructor-feedback'));
    await db.delete(userTable).where(eq(userTable.id, userId));
    await close();
  });

  it('answers a toggle with a row the admin page can parse', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password: PASSWORD });

    const res = await agent
      .patch('/api/admin/feature-flags/instructor-feedback')
      .set('Origin', ORIGIN)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(FeatureFlagSchema.parse(res.body)).toMatchObject({
      code: 'instructor-feedback',
      enabled: true,
      updatedBy: { id: userId, email },
    });
  });
});
