import { describe, expect, it, vi } from 'vitest';

import {
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';

import { TechniqueRepository } from './technique.repository.js';

/**
 * Structural test for `listClassificationsByTechniqueIds` — pins the
 * "one SELECT regardless of N" contract that the new batched
 * hydration path in `TechniqueService.list` relies on.
 *
 * Before this chunk, hydration ran `repo.listClassifications(rowId)`
 * once per technique inside a `Promise.all`. With a page of 50
 * techniques that was 50 round-trips. The new batch method fires
 * a single `SELECT … WHERE technique_id IN (?, ?, …) ORDER BY
 * technique_id, sort_order`, so the cost is always 1 round-trip.
 *
 * Drives a recording fake executor — the SQL correctness is covered
 * by the e2e suite on real Postgres in CI's `backend-e2e` job. The
 * goal here is to make a future regression that re-introduces the
 * per-row query fail the build with a clear "expected 1 select call,
 * got N".
 */

function buildFakeSelectExecutor() {
  const orderByThen = vi.fn().mockResolvedValue([]);
  const whereThen = {
    orderBy: vi.fn().mockImplementation(() => orderByThen()),
  };
  const fromThen = {
    where: vi.fn().mockReturnValue(whereThen),
  };
  const selectThen = {
    from: vi.fn().mockReturnValue(fromThen),
  };

  const executor = {
    select: vi.fn().mockReturnValue(selectThen),
  };

  return {
    executor: executor as unknown as DrizzleExecutor,
    counters: {
      get selectCalls() { return executor.select.mock.calls.length; },
      get whereCalls() { return fromThen.where.mock.calls.length; },
      get orderByCalls() { return whereThen.orderBy.mock.calls.length; },
    },
  };
}

describe('TechniqueRepository.listClassificationsByTechniqueIds', () => {
  it('with N=50 technique ids fires exactly one SELECT (no per-row queries)', async () => {
    const { executor, counters } = buildFakeSelectExecutor();
    const repo = new TechniqueRepository({} as DrizzleDb);

    const ids = Array.from({ length: 50 }, (_, i) => `tech-${i}`);
    await repo.listClassificationsByTechniqueIds(ids, executor);

    expect(counters.selectCalls).toBe(1);
    expect(counters.whereCalls).toBe(1);
    expect(counters.orderByCalls).toBe(1);
  });

  it('returns [] without issuing a query when the id list is empty', async () => {
    const { executor, counters } = buildFakeSelectExecutor();
    const repo = new TechniqueRepository({} as DrizzleDb);

    const out = await repo.listClassificationsByTechniqueIds([], executor);

    expect(out).toEqual([]);
    expect(counters.selectCalls).toBe(0);
  });
});

/**
 * Structural test for `replaceClassifications` — pins the new
 * "1–2 round-trips regardless of N" contract.
 *
 * Old shape (before Chunk 1.4):
 *   - 1 SELECT existing
 *   - 1 DELETE not-in
 *   - N INSERTs (one per category, each with its own ON CONFLICT)
 *   = 2 + N round-trips for an N-item replace.
 *
 * New shape:
 *   - 1 DELETE not-in (or unconditional when N = 0)
 *   - 1 bulk INSERT … ON CONFLICT DO UPDATE SET sort_order =
 *     EXCLUDED.sort_order  (skipped when N = 0)
 *   = 1 round-trip when N = 0, 2 round-trips otherwise.
 *
 * The test exercises the contract via a fake executor that records
 * every fluent-chain entry-point. The repo's internal SQL shape is
 * already covered by the e2e tests (those hit a real Postgres);
 * what this spec gives us is a fast, drift-resistant guard against
 * the loop sneaking back in.
 *
 * Performance note for reviewers: under the old shape with a
 * 10-classification replace, an EXPLAIN ANALYZE would have shown
 * 11 separate `INSERT … ON CONFLICT` plans + 1 SELECT + 1 DELETE.
 * Under the new shape it's a single multi-row `INSERT … VALUES (…),
 * (…), … ON CONFLICT DO UPDATE`, which Postgres plans once.
 */

function buildFakeExecutor() {
  const deleteCalls: Array<{ wherePresent: boolean }> = [];
  const insertCalls: Array<{
    valuesLength: number;
    hadOnConflict: boolean;
  }> = [];

  const deleteThen = {
    where: vi.fn().mockImplementation(async () => {
      deleteCalls[deleteCalls.length - 1] = { wherePresent: true };
      return undefined;
    }),
  };

  const insertThen = {
    values: vi.fn().mockImplementation((vals: unknown[]) => {
      insertCalls.push({ valuesLength: vals.length, hadOnConflict: false });
      const valuesThen = {
        onConflictDoUpdate: vi.fn().mockImplementation(async () => {
          insertCalls[insertCalls.length - 1]!.hadOnConflict = true;
          return undefined;
        }),
      };
      return valuesThen;
    }),
  };

  const executor = {
    delete: vi.fn().mockImplementation(() => {
      deleteCalls.push({ wherePresent: false });
      return deleteThen;
    }),
    insert: vi.fn().mockImplementation(() => insertThen),
  };

  return { executor: executor as unknown as DrizzleExecutor, deleteCalls, insertCalls };
}

describe('TechniqueRepository.replaceClassifications', () => {
  it('with N=10 ids fires exactly 1 DELETE + 1 bulk INSERT (2 round-trips total)', async () => {
    const { executor, deleteCalls, insertCalls } = buildFakeExecutor();
    const repo = new TechniqueRepository({} as DrizzleDb);

    const ids = Array.from({ length: 10 }, (_, i) => `cat-${i}`);
    await repo.replaceClassifications('tech-1', ids, executor);

    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.wherePresent).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.valuesLength).toBe(10);
    expect(insertCalls[0]?.hadOnConflict).toBe(true);
  });

  it('deduplicates input before the bulk INSERT', async () => {
    const { executor, insertCalls } = buildFakeExecutor();
    const repo = new TechniqueRepository({} as DrizzleDb);

    await repo.replaceClassifications(
      'tech-1',
      ['cat-a', 'cat-b', 'cat-a', 'cat-c', 'cat-b'],
      executor,
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.valuesLength).toBe(3);
  });

  it('with N=0 fires 1 unconditional DELETE and no INSERT', async () => {
    const { executor, deleteCalls, insertCalls } = buildFakeExecutor();
    const repo = new TechniqueRepository({} as DrizzleDb);

    await repo.replaceClassifications('tech-1', [], executor);

    expect(deleteCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(0);
  });
});
