import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { mcpResource } from '../../src/infrastructure/auth/mcp-access.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  organisationMembership,
  organisations,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * The OAuth side of MCP: discovery documents at the origin's root, and the
 * rule that only sysadmins and orgadmins may grant an AI client access.
 * The MCP endpoint itself (/api/mcp) is not part of this change.
 */

const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
const PASSWORD = 'mcp-oauth-password-123';
// Hits the grant endpoint; the unknown client is rejected only after the role gate.
const AUTHORIZE = '/api/auth/oauth2/authorize?client_id=unknown-client&response_type=code';

describe.skipIf(!hasDatabase())('MCP OAuth (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;

  const stamp = Date.now();
  const emails = {
    sysadmin: `mcp-sysadmin-${stamp}@example.com`,
    orgadmin: `mcp-orgadmin-${stamp}@example.com`,
    instructor: `mcp-instructor-${stamp}@example.com`,
    plain: `mcp-plain-${stamp}@example.com`,
  };
  const ids: Record<keyof typeof emails, string> = {
    sysadmin: '',
    orgadmin: '',
    instructor: '',
    plain: '',
  };
  let orgId: string;

  const agentFor = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  };

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    close = built.close;
    db = app.get<DrizzleDb>(DRIZZLE);
    const auth = app.get<Auth>(BETTER_AUTH);

    for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
      const created = await auth.api.signUpEmail({
        body: { email: emails[key], password: PASSWORD, name: `MCP ${key}` },
      });
      ids[key] = created.user.id;
    }
    await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, ids.sysadmin));

    const [org] = await db
      .insert(organisations)
      .values({
        type: 'club',
        shortCode: `MCP${stamp}`.slice(0, 12),
        nameEn: 'MCP test club',
        nameSv: 'MCP-testklubb',
        nameFi: 'MCP-testiseura',
      })
      .returning({ id: organisations.id });
    orgId = org!.id;
    await db.insert(organisationMembership).values([
      { userId: ids.orgadmin, organisationId: orgId, role: 'orgadmin' },
      { userId: ids.instructor, organisationId: orgId, role: 'instructor' },
    ]);
  });

  afterAll(async () => {
    await db.delete(userTable).where(inArray(userTable.id, Object.values(ids)));
    await db.delete(organisations).where(eq(organisations.id, orgId));
    await close();
  });

  describe('discovery', () => {
    it('serves protected resource metadata for /api/mcp at the origin root', async () => {
      const res = await request(app.getHttpServer()).get(
        '/.well-known/oauth-protected-resource/api/mcp',
      );
      expect(res.status).toBe(200);
      expect(res.body.resource).toBe(mcpResource({ BETTER_AUTH_URL }));
      expect(res.body.authorization_servers).toEqual([`${BETTER_AUTH_URL}/api/auth`]);
    });

    it('serves authorization server metadata with CIMD on and registration off', async () => {
      const res = await request(app.getHttpServer()).get(
        '/.well-known/oauth-authorization-server/api/auth',
      );
      expect(res.status).toBe(200);
      expect(res.body.issuer).toBe(`${BETTER_AUTH_URL}/api/auth`);
      expect(res.body.authorization_endpoint).toBe(`${BETTER_AUTH_URL}/api/auth/oauth2/authorize`);
      expect(res.body.client_id_metadata_document_supported).toBe(true);
      expect(res.body.registration_endpoint).toBeUndefined();
    });

    it('keeps the JWT plugin token route disabled', async () => {
      const agent = await agentFor(emails.sysadmin);
      const res = await agent.get('/api/auth/token');
      expect(res.status).toBe(404);
    });
  });

  describe('who may grant an AI client access', () => {
    it.each([
      ['a sysadmin', 'sysadmin'],
      ['an orgadmin', 'orgadmin'],
    ] as const)('lets %s through to the authorize endpoint', async (_label, key) => {
      const agent = await agentFor(emails[key]);
      const res = await agent.get(AUTHORIZE);
      // Past the role gate, the unknown client is what gets rejected.
      expect(res.status).not.toBe(403);
      expect(res.headers.location ?? '').toContain('invalid_client');
    });

    it.each([
      ['an instructor', 'instructor'],
      ['a user without an admin role', 'plain'],
    ] as const)('refuses %s at authorize and consent', async (_label, key) => {
      const agent = await agentFor(emails[key]);

      const authorize = await agent.get(AUTHORIZE);
      expect(authorize.status).toBe(403);
      expect(authorize.body.code).toBe('MCP_NOT_ALLOWED');

      const consent = await agent
        .post('/api/auth/oauth2/consent')
        .set('Origin', ORIGIN)
        .send({ accept: true });
      expect(consent.status).toBe(403);
      expect(consent.body.code).toBe('MCP_NOT_ALLOWED');
    });

    it('sends a visitor without a session to the login page', async () => {
      const res = await request(app.getHttpServer()).get(AUTHORIZE);
      expect(res.status).not.toBe(403);
    });
  });
});
