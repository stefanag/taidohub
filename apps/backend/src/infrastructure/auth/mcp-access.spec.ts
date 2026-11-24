import { describe, expect, it, vi } from 'vitest';

import { type DrizzleDb } from '../database/client.js';

import { canConnectMcpClient, mcpResource } from './mcp-access.js';

/**
 * A Drizzle stand-in for `select().from().where().limit()`: each call to
 * `limit` resolves with the next queued result.
 */
function fakeDb(...results: unknown[][]): DrizzleDb {
  const limit = vi.fn();
  for (const r of results) limit.mockResolvedValueOnce(r);
  const chain = { from: () => chain, where: () => chain, limit };
  return { select: () => chain } as unknown as DrizzleDb;
}

describe('mcpResource', () => {
  it('is the API origin plus /api/mcp', () => {
    expect(mcpResource({ BETTER_AUTH_URL: 'https://taidohub.se' })).toBe(
      'https://taidohub.se/api/mcp',
    );
  });

  it('ignores a path or trailing slash on BETTER_AUTH_URL', () => {
    expect(mcpResource({ BETTER_AUTH_URL: 'https://staging.taidohub.se/' })).toBe(
      'https://staging.taidohub.se/api/mcp',
    );
  });
});

describe('canConnectMcpClient', () => {
  it('allows an active sysadmin without looking at memberships', async () => {
    const db = fakeDb([{ role: 'sysadmin' }]);
    await expect(canConnectMcpClient(db, 'u1')).resolves.toBe(true);
  });

  it('allows a user who is orgadmin of an organisation', async () => {
    const db = fakeDb([{ role: 'user' }], [{ organisationId: 'org-1' }]);
    await expect(canConnectMcpClient(db, 'u1')).resolves.toBe(true);
  });

  it('refuses a user with no orgadmin membership', async () => {
    const db = fakeDb([{ role: 'user' }], []);
    await expect(canConnectMcpClient(db, 'u1')).resolves.toBe(false);
  });

  it('refuses a user who is missing or deactivated', async () => {
    const db = fakeDb([]);
    await expect(canConnectMcpClient(db, 'u1')).resolves.toBe(false);
  });
});
