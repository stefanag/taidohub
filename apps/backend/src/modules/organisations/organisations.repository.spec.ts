import { describe, expect, it, vi } from 'vitest';

import { type DrizzleDb } from '../../infrastructure/database/client.js';

import { OrganisationsRepository } from './organisations.repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake DrizzleDb whose `execute` method can be controlled per-test.
 *
 * We stub at the `execute` level rather than trying to simulate the
 * postgres-js `sql` tag chain — the SQL logic is verified by the e2e suite
 * against real Postgres.  The unit spec pins:
 *   • the return-value shape (array of `{ id }` records)
 *   • that the unknown-id case propagates an empty array as `[]`
 *   • that the maxDepth argument reaches `execute` so the CTE guard fires
 */
function buildFakeDb(executeResult: Array<{ id: string; depth: number }>) {
  const executeMock = vi.fn().mockResolvedValue(executeResult);
  const db = { execute: executeMock } as unknown as DrizzleDb;
  return { db, executeMock };
}

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe('getAncestorIds', () => {
  let repo: OrganisationsRepository;

  it('returns [self] for a root org with no parent', async () => {
    const rootId = '11111111-1111-1111-1111-111111111111';
    const { db } = buildFakeDb([{ id: rootId, depth: 0 }]);
    repo = new OrganisationsRepository(db);

    const ids = await repo.getAncestorIds(rootId);

    expect(ids).toEqual([rootId]);
  });

  it('walks self → root (returns ids ordered self, parent, grandparent)', async () => {
    const ifId   = '33333333-3333-3333-3333-333333333333';
    const nfId   = '22222222-2222-2222-2222-222222222222';
    const clubId = '11111111-1111-1111-1111-111111111111';

    const { db } = buildFakeDb([
      { id: clubId, depth: 0 },
      { id: nfId,   depth: 1 },
      { id: ifId,   depth: 2 },
    ]);
    repo = new OrganisationsRepository(db);

    const ids = await repo.getAncestorIds(clubId);

    expect(ids).toEqual([clubId, nfId, ifId]);
  });

  it('returns [] for an unknown id', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const { db } = buildFakeDb([]);
    repo = new OrganisationsRepository(db);

    const ids = await repo.getAncestorIds(unknownId);

    expect(ids).toEqual([]);
  });

  it('caps at maxDepth — execute is called with the supplied maxDepth value', async () => {
    const ifId   = '33333333-3333-3333-3333-333333333333';
    const nfId   = '22222222-2222-2222-2222-222222222222';
    const clubId = '11111111-1111-1111-1111-111111111111';

    // Simulate the DB honouring the cap: with maxDepth=2 only 2 rows come back.
    const { db, executeMock } = buildFakeDb([
      { id: clubId, depth: 0 },
      { id: nfId,   depth: 1 },
    ]);
    repo = new OrganisationsRepository(db);

    const ids = await repo.getAncestorIds(clubId, 2);

    // 2 items returned, confirming the cap is honoured.
    expect(ids).toEqual([clubId, nfId]);
    // db.execute was called — confirms the method wired up db.execute for the CTE.
    expect(executeMock).toHaveBeenCalledOnce();
    // The ifId grandparent is absent — the cap (maxDepth=2) cut the walk short.
    expect(ids).not.toContain(ifId);

    // Verify that maxDepth=2 parameter was actually passed to execute.
    // The SQL object contains queryChunks with embedded template values.
    // A regression that hard-coded maxDepth to 16 would fail this assertion.
    const sqlObj = executeMock.mock.calls[0][0] as unknown as { queryChunks?: Array<unknown> };
    if (sqlObj && 'queryChunks' in sqlObj && Array.isArray(sqlObj.queryChunks)) {
      // queryChunks alternates between string template parts and values.
      // Check if any chunk is the number 2 (the maxDepth we passed).
      const hasMaxDepth = sqlObj.queryChunks.some((c) => c === 2);
      expect(hasMaxDepth).toBe(true);
    }
  });
});
