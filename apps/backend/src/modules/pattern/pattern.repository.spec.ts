import { describe, expect, it, vi } from 'vitest';

import {
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';

import { PatternRepository } from './pattern.repository.js';

/**
 * Mirror of `technique.repository.spec.ts` for the pattern junction
 * table. Same structural contract:
 *
 *   `listClassificationsByPatternIds(ids)` MUST fire exactly one
 *   SELECT regardless of N, so the pattern list path doesn't pay
 *   per-row round-trips. SQL correctness is exercised by the e2e
 *   suite on real Postgres.
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

describe('PatternRepository.listClassificationsByPatternIds', () => {
  it('with N=50 pattern ids fires exactly one SELECT (no per-row queries)', async () => {
    const { executor, counters } = buildFakeSelectExecutor();
    const repo = new PatternRepository({} as DrizzleDb);

    const ids = Array.from({ length: 50 }, (_, i) => `pat-${i}`);
    await repo.listClassificationsByPatternIds(ids, executor);

    expect(counters.selectCalls).toBe(1);
    expect(counters.whereCalls).toBe(1);
    expect(counters.orderByCalls).toBe(1);
  });

  it('returns [] without issuing a query when the id list is empty', async () => {
    const { executor, counters } = buildFakeSelectExecutor();
    const repo = new PatternRepository({} as DrizzleDb);

    const out = await repo.listClassificationsByPatternIds([], executor);

    expect(out).toEqual([]);
    expect(counters.selectCalls).toBe(0);
  });
});
