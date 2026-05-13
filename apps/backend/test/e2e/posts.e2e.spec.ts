import { type NestExpressApplication } from '@nestjs/platform-express';
import { AuthRoutes, PostsRoutes } from '@repo/contracts/routes';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, hasDatabase } from '../helpers/app-factory';
import { resetDatabase } from '../helpers/db-reset';

describe.skipIf(!hasDatabase())('posts e2e', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let cookie: string;

  const credentials = {
    email: `posts-${Date.now()}@example.com`,
    password: 'super-secret-correct-horse',
    name: 'Posts Tester',
  };

  beforeAll(async () => {
    await resetDatabase();
    const built = await buildTestApp();
    app = built.app;
    close = built.close;

    // Sign up — better-auth `autoSignIn` returns a session cookie immediately.
    const signup = await request(app.getHttpServer())
      .post(AuthRoutes.signUp)
      .send(credentials);
    expect([200, 201]).toContain(signup.status);

    const setCookie = signup.headers['set-cookie'];
    cookie = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie as string);
    expect(cookie).toContain('better-auth.session_token');
  });

  afterAll(async () => {
    await close?.();
  });

  it('rejects POST /api/posts without a session (401)', async () => {
    const res = await request(app.getHttpServer())
      .post(PostsRoutes.base)
      .send({ title: 'nope', content: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('creates, lists, and reads a post for the signed-in user', async () => {
    const created = await request(app.getHttpServer())
      .post(PostsRoutes.base)
      .set('Cookie', cookie)
      .send({ title: 'Hello', content: 'World', published: true });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Hello');

    const list = await request(app.getHttpServer()).get(PostsRoutes.base);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);

    const fetched = await request(app.getHttpServer()).get(PostsRoutes.byId(created.body.id));
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('forbids another user from updating someone else\'s post (403)', async () => {
    // Create a second user with their own session.
    const other = await request(app.getHttpServer())
      .post(AuthRoutes.signUp)
      .send({
        email: `other-${Date.now()}@example.com`,
        password: 'super-secret-correct-horse',
        name: 'Other',
      });
    const otherCookieRaw = other.headers['set-cookie'];
    const otherCookie = Array.isArray(otherCookieRaw) ? otherCookieRaw.join('; ') : (otherCookieRaw as string);

    // First user creates a post.
    const created = await request(app.getHttpServer())
      .post(PostsRoutes.base)
      .set('Cookie', cookie)
      .send({ title: 'Mine', content: 'Mine', published: true });

    // Second user tries to update it.
    const denied = await request(app.getHttpServer())
      .patch(PostsRoutes.byId(created.body.id))
      .set('Cookie', otherCookie)
      .send({ title: 'Hijacked' });

    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe('FORBIDDEN');
  });
});
