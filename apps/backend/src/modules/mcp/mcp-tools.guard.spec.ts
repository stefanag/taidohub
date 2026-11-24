import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Actions, Subjects } from '@repo/contracts/casl';
import { McpStagedResultSchema } from '@repo/contracts/mcp';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { McpServerFactory } from './mcp-server.factory.js';
import { McpToolRegistry } from './mcp-tool.registry.js';
import { MCP_INSTRUCTIONS } from './mcp.instructions.js';
import { type McpToolContext, type McpToolDefinition } from './mcp.types.js';
import { McpPendingTools } from './tools/pending.tools.js';
import { McpReadTools } from './tools/read.tools.js';

/**
 * Conventions every MCP tool must follow (see the "tool authoring contract"
 * in docs/superpowers/specs/2026-11-24-mcp-module-design.md). These run over
 * every registered tool, so a new tool that breaks one fails here.
 */

const actor: AuthenticatedUser = {
  id: 'admin-1',
  email: 'a@example.com',
  emailVerified: true,
  name: 'Admin',
  image: null,
  role: 'sysadmin',
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

function ctxWith(configure: (builder: AbilityBuilder<AppAbility>) => void): McpToolContext {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  configure(builder);
  return { actor, ability: builder.build() };
}

const readTools = new McpReadTools(
  ...([{}, {}, {}, {}, {}, {}] as unknown as ConstructorParameters<typeof McpReadTools>),
);
const factory = new McpServerFactory(readTools, new McpPendingTools({} as never));
const tools: readonly McpToolDefinition[] = factory.registry.tools;

async function listTools(): Promise<unknown> {
  const server = factory.build(ctxWith((b) => b.can('manage', 'all')));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'guard', version: '1' });
  await client.connect(clientSide);
  const result = await client.listTools();
  await client.close();
  return result;
}

describe('MCP tool conventions', () => {
  it('registers at least the skeleton tools', () => {
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['list_my_organisations', 'list_students', 'propose_rank_entry']),
    );
  });

  describe.each(tools.map((t) => [t.name, t] as const))('%s', (name, tool) => {
    it('has a snake_case name', () => {
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    });

    it('has an agent-facing description of at most 280 characters', () => {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.description.length).toBeLessThanOrEqual(280);
    });

    it('takes a strict object as input', () => {
      const schema = z.toJSONSchema(tool.inputSchema) as { type?: string; additionalProperties?: unknown };
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
    });

    it('returns an object', () => {
      expect((z.toJSONSchema(tool.outputSchema, { io: 'output' }) as { type?: string }).type).toBe('object');
    });

    it('declares a known CASL ability', () => {
      const [action, subject] = tool.ability;
      expect(Actions).toContain(action);
      expect(Subjects).toContain(subject);
      expect(subject).not.toBe('all');
    });

    if (tool.kind === 'staged') {
      it('returns the staged envelope', () => {
        expect(tool.outputSchema).toBe(McpStagedResultSchema);
      });
    }
  });

  it('offers no tool that approves a proposal', () => {
    expect(tools.some((t) => /approve/.test(t.name))).toBe(false);
  });

  it('lists tools byte-identically on every request', async () => {
    expect(JSON.stringify(await listTools())).toBe(JSON.stringify(await listTools()));
  });

  it('keeps the server instructions short, with the rules first', () => {
    expect(MCP_INSTRUCTIONS.length).toBeLessThan(4000);
    expect(MCP_INSTRUCTIONS.indexOf('Rules:')).toBeLessThan(MCP_INSTRUCTIONS.indexOf('Typical flow'));
  });
});

describe('McpToolRegistry', () => {
  const handler = vi.fn(async () => ({ ok: true }));
  const tool: McpToolDefinition = {
    name: 'demo_tool',
    title: 'Demo',
    description: 'Use to test the registry.',
    inputSchema: z.strictObject({}),
    outputSchema: z.object({ ok: z.boolean() }),
    ability: ['read', 'Student'],
    kind: 'read',
    handler,
  };
  const registry = new McpToolRegistry([tool]);
  const logger = new Logger('test');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);

  it('denies a call whose declared ability the actor lacks, without running the handler', async () => {
    const result = await registry.call(tool, {}, ctxWith(() => undefined));
    expect(result.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns structured content when allowed', async () => {
    const result = await registry.call(tool, {}, ctxWith((b) => b.can('read', 'Student')));
    expect(result).toMatchObject({ structuredContent: { ok: true } });
  });

  it('turns a service error envelope into a tool error', async () => {
    handler.mockRejectedValueOnce(
      new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Not yours.' } }),
    );
    const result = await registry.call(tool, {}, ctxWith((b) => b.can('read', 'Student')));
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'FORBIDDEN: Not yours.' }] });
  });

  it('rejects duplicate tool names', () => {
    expect(() => new McpToolRegistry([tool, tool])).toThrow(/Duplicate/);
  });
});
