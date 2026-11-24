import { type AddressInfo } from 'node:net';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { mcpResource } from '../../src/infrastructure/auth/mcp-access.js';
import { DRIZZLE, type DrizzleDb } from '../../src/infrastructure/database/client.js';
import {
  auditLog,
  beltRanks,
  beltSystems,
  featureFlag,
  organisationMembership,
  organisations,
  pendingOperation,
  rankHistory,
  user as userTable,
} from '../../src/infrastructure/database/schema/index.js';
import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * The MCP server at /api/mcp, driven by the official SDK client against the
 * real Nest app and database.
 *
 * Access tokens are signed with the app's own JWKS (better-auth's jwt
 * plugin), with the MCP resource as audience — the same verification path a
 * token from the OAuth flow takes. The flow itself is covered by
 * mcp-oauth.e2e.spec.ts.
 */

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';
const RESOURCE = mcpResource({ BETTER_AUTH_URL });
const ISSUER = `${BETTER_AUTH_URL}/api/auth`;
const CLIENT_ID = 'https://client.example/oauth/metadata.json';
const PASSWORD = 'mcp-e2e-password-123';
const ORIGIN = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')[0]!.trim();

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'raw', version: '1' },
  },
};

type Person = 'sysadmin' | 'orgadmin' | 'instructor' | 'student' | 'outsider';

describe.skipIf(!hasDatabase())('MCP server (integration)', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  let db: DrizzleDb;
  let auth: Auth;
  let baseUrl: string;

  const stamp = Date.now();
  const ids = {} as Record<Person, string>;
  let clubId: string;
  let otherClubId: string;
  let systemId: string;
  let firstRankId: string;
  let secondRankId: string;

  const tokenFor = async (userId: string, payload: Record<string, unknown> = {}) => {
    const { token } = await auth.api.signJWT({
      body: {
        // `iss` as the OAuth provider sets it on real access tokens (the
        // jwt plugin's own default is the bare origin).
        payload: { iss: ISSUER, sub: userId, aud: RESOURCE, azp: CLIENT_ID, scope: 'openid', ...payload },
      },
    });
    return token;
  };

  const connect = async (person: Person): Promise<Client> => {
    const token = await tokenFor(ids[person]);
    const client = new Client({ name: 'taidohub-e2e', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL('/api/mcp', baseUrl), {
        authProvider: { token: async () => token },
      }),
    );
    return client;
  };

  const callJson = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return result as { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] };
  };

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    close = built.close;
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    db = app.get<DrizzleDb>(DRIZZLE);
    auth = app.get<Auth>(BETTER_AUTH);

    for (const person of ['sysadmin', 'orgadmin', 'instructor', 'student', 'outsider'] as const) {
      const created = await auth.api.signUpEmail({
        body: { email: `mcp-${person}-${stamp}@example.com`, password: PASSWORD, name: `MCP ${person}` },
      });
      ids[person] = created.user.id;
    }
    await db.update(userTable).set({ role: 'sysadmin' }).where(eq(userTable.id, ids.sysadmin));

    const clubs = await db
      .insert(organisations)
      .values([
        { type: 'club', shortCode: `MCPA${stamp}`.slice(0, 12), nameEn: 'MCP club A', nameSv: 'A', nameFi: 'A' },
        { type: 'club', shortCode: `MCPB${stamp}`.slice(0, 12), nameEn: 'MCP club B', nameSv: 'B', nameFi: 'B' },
      ])
      .returning({ id: organisations.id });
    clubId = clubs[0]!.id;
    otherClubId = clubs[1]!.id;
    await db.insert(organisationMembership).values([
      { userId: ids.orgadmin, organisationId: clubId, role: 'orgadmin' },
      { userId: ids.instructor, organisationId: clubId, role: 'instructor' },
      { userId: ids.student, organisationId: clubId, role: 'student' },
      { userId: ids.outsider, organisationId: otherClubId, role: 'student' },
    ]);

    const [system] = await db
      .insert(beltSystems)
      .values({ code: `MCP-SYS-${stamp}`, nameEn: 'MCP system', nameSv: 'MCP', nameFi: 'MCP', sortOrder: 98 })
      .returning({ id: beltSystems.id });
    systemId = system!.id;
    const [second] = await db
      .insert(beltRanks)
      .values({ systemId, level: 2, sortOrder: 2, nameRomaji: 'Yonkyu', nameEn: '4th Kyu', beltColor: '#0000FF' })
      .returning({ id: beltRanks.id });
    secondRankId = second!.id;
    const [first] = await db
      .insert(beltRanks)
      .values({
        systemId,
        level: 1,
        sortOrder: 1,
        nameRomaji: 'Gokyu',
        nameEn: '5th Kyu',
        beltColor: '#FFFF00',
        nextRankId: secondRankId,
      })
      .returning({ id: beltRanks.id });
    firstRankId = first!.id;
    await db.insert(rankHistory).values({
      userId: ids.student,
      rankId: firstRankId,
      date: '2026-05-01',
      result: 'pass',
      source: 'external',
      recordedByUserId: ids.instructor,
    });
    await db
      .insert(featureFlag)
      .values({ code: 'grading-history', enabled: true })
      .onConflictDoUpdate({ target: featureFlag.code, set: { enabled: true } });
  });

  const webAgentFor = async (person: Person) => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: `mcp-${person}-${stamp}@example.com`, password: PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  };

  afterAll(async () => {
    await db.delete(featureFlag).where(eq(featureFlag.code, 'grading-history'));
    await db.delete(pendingOperation).where(inArray(pendingOperation.createdByUserId, Object.values(ids)));
    await db.delete(rankHistory).where(inArray(rankHistory.userId, Object.values(ids)));
    await db.delete(userTable).where(inArray(userTable.id, Object.values(ids)));
    await db.delete(beltRanks).where(eq(beltRanks.systemId, systemId));
    await db.delete(beltSystems).where(eq(beltSystems.id, systemId));
    await db.delete(organisations).where(inArray(organisations.id, [clubId, otherClubId]));
    await close();
  });

  describe('access', () => {
    it('answers 401 with a WWW-Authenticate challenge without a token', async () => {
      const res = await request(app.getHttpServer()).post('/api/mcp').send(INITIALIZE);
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('resource_metadata=');
      expect(res.headers['www-authenticate']).toContain('/.well-known/oauth-protected-resource/api/mcp');
    });

    it('answers 401 for a token with the wrong audience', async () => {
      const token = await tokenFor(ids.orgadmin, { aud: `${BETTER_AUTH_URL}/api/other` });
      const res = await request(app.getHttpServer())
        .post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send(INITIALIZE);
      expect(res.status).toBe(401);
    });

    it('refuses a browser request from a foreign origin', async () => {
      const token = await tokenFor(ids.orgadmin);
      const res = await request(app.getHttpServer())
        .post('/api/mcp')
        .set('Origin', 'https://evil.example')
        .set('Authorization', `Bearer ${token}`)
        .send(INITIALIZE);
      expect(res.status).toBe(403);
    });

    it.each(['instructor', 'student'] as const)('answers 403 MCP_NOT_ALLOWED for a %s token', async (person) => {
      const token = await tokenFor(ids[person]);
      const res = await request(app.getHttpServer())
        .post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send(INITIALIZE);
      expect(res.status).toBe(403);
      expect(res.body.error.data.code).toBe('MCP_NOT_ALLOWED');
    });
  });

  describe('as an orgadmin', () => {
    let client: Client;

    beforeAll(async () => {
      client = await connect('orgadmin');
    });

    afterAll(async () => {
      await client.close();
    });

    it('lists the tools with strict input schemas and the resource', async () => {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(
        expect.arrayContaining([
          'list_my_organisations',
          'list_students',
          'get_student_progress',
          'get_next_rank_requirements',
          'get_statistics_summary',
        ]),
      );
      for (const tool of tools) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
      }
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toContain('taidohub://me');
    });

    it('reads taidohub://me', async () => {
      const { contents } = await client.readResource({ uri: 'taidohub://me' });
      const me = JSON.parse((contents[0] as { text: string }).text) as {
        id: string;
        memberships: { organisationId: string; organisationName: string; role: string }[];
      };
      expect(me.id).toBe(ids.orgadmin);
      expect(me.memberships).toEqual([
        { organisationId: clubId, organisationName: 'MCP club A', role: 'orgadmin' },
      ]);
    });

    it('lists only their own organisations', async () => {
      const result = await callJson(client, 'list_my_organisations');
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        organisations: [{ id: clubId, name: 'MCP club A', type: 'club', roles: ['orgadmin'] }],
      });
    });

    it('lists students in their organisation only', async () => {
      const result = await callJson(client, 'list_students');
      const students = result.structuredContent!.students as { userId: string }[];
      const studentIds = students.map((s) => s.userId);
      expect(studentIds).toContain(ids.student);
      expect(studentIds).not.toContain(ids.outsider);
    });

    it('reads progress for a student in their organisation', async () => {
      const result = await callJson(client, 'get_student_progress', { studentUserId: ids.student });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ progress: [] });
    });

    it('is refused progress for a student in another organisation', async () => {
      const result = await callJson(client, 'get_student_progress', { studentUserId: ids.outsider });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/^FORBIDDEN:/);
    });

    it('resolves the next rank after the latest passed grading', async () => {
      const result = await callJson(client, 'get_next_rank_requirements', { studentUserId: ids.student });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        currentRank: { id: firstRankId, name: '5th Kyu' },
        targetRank: { id: secondRankId, name: '4th Kyu' },
        note: null,
      });
    });

    it('is refused statistics for another organisation and platform totals', async () => {
      const other = await callJson(client, 'get_statistics_summary', { organisationId: otherClubId });
      expect(other.content[0]!.text).toMatch(/^FORBIDDEN:/);
      const platform = await callJson(client, 'get_statistics_summary');
      expect(platform.isError).toBe(true);
      expect(platform.content[0]!.text).toMatch(/^FORBIDDEN:/);
    });

    it('rejects unknown arguments', async () => {
      const result = await client
        .callTool({ name: 'list_students', arguments: { organisationId: clubId, extra: true } })
        .catch((err: unknown) => ({ isError: true, thrown: err }));
      expect((result as { isError?: boolean }).isError).toBe(true);
    });
  });

  describe('as a sysadmin', () => {
    it('sees students in every organisation', async () => {
      const client = await connect('sysadmin');
      const result = await callJson(client, 'list_students', { organisationId: otherClubId });
      const students = result.structuredContent!.students as { userId: string }[];
      expect(students.map((s) => s.userId)).toContain(ids.outsider);
      await client.close();
    });
  });

  describe('proposals', () => {
    let client: Client;

    beforeAll(async () => {
      client = await connect('orgadmin');
    });

    afterAll(async () => {
      await client.close();
    });

    const propose = async (date: string) => {
      const result = await callJson(client, 'propose_rank_entry', {
        studentUserId: ids.student,
        rankId: secondRankId,
        date,
        examinerName: 'Sensei Test',
      });
      expect(result.isError).toBeFalsy();
      return result.structuredContent as {
        staged: true;
        operationId: string;
        preview: { studentName: string; rankName: string };
        message: string;
      };
    };

    const historyRows = () =>
      db.select().from(rankHistory).where(eq(rankHistory.userId, ids.student));

    it('stages a grading entry without writing it, then writes it when the proposer approves', async () => {
      const before = (await historyRows()).length;
      const staged = await propose('2026-11-20');
      expect(staged).toMatchObject({
        staged: true,
        preview: { studentName: 'MCP student', rankName: '4th Kyu' },
      });
      expect(staged.message).toMatch(/approve it in TaidoHub/);
      expect(await historyRows()).toHaveLength(before);

      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).not.toContain('approve_pending_operation');

      const web = await webAgentFor('orgadmin');
      const listed = await web.get('/api/pending-operations?status=pending');
      expect(listed.status).toBe(200);
      expect(listed.body.data.map((o: { id: string }) => o.id)).toContain(staged.operationId);

      const approved = await web.post(`/api/pending-operations/${staged.operationId}/approve`);
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('approved');

      const rows = await historyRows();
      expect(rows).toHaveLength(before + 1);
      const created = rows.find((r) => r.id === approved.body.resultEntityId)!;
      expect(created).toMatchObject({ rankId: secondRankId, date: '2026-11-20', recordedByUserId: ids.orgadmin });

      const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
      expect(audit).toEqual([
        expect.objectContaining({ entityType: 'rank_history', action: 'create', origin: 'mcp', actingUserId: ids.orgadmin }),
      ]);

      const again = await web.post(`/api/pending-operations/${staged.operationId}/approve`);
      expect(again.status).toBe(409);
    });

    it('lets only the proposer approve', async () => {
      const staged = await propose('2026-11-21');
      const sysadmin = await webAgentFor('sysadmin');
      const res = await sysadmin.post(`/api/pending-operations/${staged.operationId}/approve`);
      expect(res.status).toBe(404);
      const row = await db.select().from(pendingOperation).where(eq(pendingOperation.id, staged.operationId));
      expect(row[0]!.status).toBe('pending');
    });

    it('withdraws a proposal over MCP', async () => {
      const staged = await propose('2026-11-22');
      const result = await callJson(client, 'reject_pending_operation', { operationId: staged.operationId });
      expect(result.isError).toBeFalsy();
      expect((result.structuredContent!.operation as { status: string }).status).toBe('rejected');
    });

    it('refuses to propose for a student in another organisation', async () => {
      const result = await callJson(client, 'propose_rank_entry', {
        studentUserId: ids.outsider,
        rankId: secondRankId,
        date: '2026-11-20',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/^FORBIDDEN:/);
    });

    it('marks a proposal failed when the write is no longer allowed at approval', async () => {
      const staged = await propose('2026-11-23');
      await db
        .delete(organisationMembership)
        .where(eq(organisationMembership.userId, ids.student));
      try {
        const web = await webAgentFor('orgadmin');
        const res = await web.post(`/api/pending-operations/${staged.operationId}/approve`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'failed', resultEntityId: null });
        expect(res.body.error).toMatch(/Cannot record history/);
      } finally {
        await db
          .insert(organisationMembership)
          .values({ userId: ids.student, organisationId: clubId, role: 'student' });
      }
    });
  });

  it('stops serving a token as soon as the user loses the orgadmin role', async () => {
    const token = await tokenFor(ids.orgadmin);
    await db
      .update(organisationMembership)
      .set({ role: 'instructor' })
      .where(eq(organisationMembership.userId, ids.orgadmin));
    try {
      const res = await request(app.getHttpServer())
        .post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send(INITIALIZE);
      expect(res.status).toBe(403);
    } finally {
      await db
        .update(organisationMembership)
        .set({ role: 'orgadmin' })
        .where(eq(organisationMembership.userId, ids.orgadmin));
    }
  });
});
