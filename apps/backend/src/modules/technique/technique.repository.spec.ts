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
