import { describe, expect, it } from 'vitest';

import { type DrizzleDb } from '../../infrastructure/database/client.js';

import { McpActorRepository } from './mcp-actor.repository.js';

/** A Drizzle stand-in: each `select()` chain resolves to the next queued result. */
function fakeDb(results: unknown[][]): DrizzleDb {
  const queue = [...results];
  const chain = () => {
    const result = queue.shift() ?? [];
    const step: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit']) step[method] = () => step;
    step.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return step;
  };
  return { select: chain } as unknown as DrizzleDb;
}

const userRow = {
  id: 'u1',
  email: 'u1@example.com',
  emailVerified: true,
  name: 'User One',
  image: null,
  role: 'user',
  locale: 'sv',
  deactivatedAt: null,
};

describe('McpActorRepository.load', () => {
  it('builds the acting user with memberships', async () => {
    const repo = new McpActorRepository(
      fakeDb([[userRow], [{ organisationId: 'org-a', role: 'orgadmin' }]]),
    );
    expect(await repo.load('u1')).toEqual({
      id: 'u1',
      email: 'u1@example.com',
      emailVerified: true,
      name: 'User One',
      image: null,
      role: 'user',
      locale: 'sv',
      deactivatedAt: null,
      memberships: [{ organisationId: 'org-a', role: 'orgadmin' }],
    });
  });

  it('reports deactivation as an ISO timestamp', async () => {
    const repo = new McpActorRepository(
      fakeDb([[{ ...userRow, deactivatedAt: new Date('2026-11-01T00:00:00Z') }], []]),
    );
    expect((await repo.load('u1'))?.deactivatedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('returns null for an unknown user', async () => {
    const repo = new McpActorRepository(fakeDb([[], []]));
    expect(await repo.load('missing')).toBeNull();
  });
});
