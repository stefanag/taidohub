import { describe, expect, it, vi } from 'vitest';

import {
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';

import { PatternRepository } from './pattern.repository.js';

/**
 * Same structural contract as the technique spec — see
 * `technique.repository.spec.ts` for the round-trip math. This
 * mirror exists because the pattern junction table is a separate
 * code path; without its own spec, the loop could regress on one
 * side and the other.
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

describe('PatternRepository.replaceClassifications', () => {
  it('with N=10 ids fires exactly 1 DELETE + 1 bulk INSERT (2 round-trips total)', async () => {
    const { executor, deleteCalls, insertCalls } = buildFakeExecutor();
    const repo = new PatternRepository({} as DrizzleDb);

    const ids = Array.from({ length: 10 }, (_, i) => `cat-${i}`);
    await repo.replaceClassifications('pat-1', ids, executor);

    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.wherePresent).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.valuesLength).toBe(10);
    expect(insertCalls[0]?.hadOnConflict).toBe(true);
  });

  it('deduplicates input before the bulk INSERT', async () => {
    const { executor, insertCalls } = buildFakeExecutor();
    const repo = new PatternRepository({} as DrizzleDb);

    await repo.replaceClassifications(
      'pat-1',
      ['cat-a', 'cat-b', 'cat-a', 'cat-c', 'cat-b'],
      executor,
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.valuesLength).toBe(3);
  });

  it('with N=0 fires 1 unconditional DELETE and no INSERT', async () => {
    const { executor, deleteCalls, insertCalls } = buildFakeExecutor();
    const repo = new PatternRepository({} as DrizzleDb);

    await repo.replaceClassifications('pat-1', [], executor);

    expect(deleteCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(0);
  });
});
