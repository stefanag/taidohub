import { describe, expect, it } from 'vitest';

import { coerceRow } from './coerce-row.js';

/**
 * Pins the four invariants the inbox repo (and any future
 * `db.execute` caller) relies on:
 *
 *   1. String inputs for `'date'` columns become real `Date`
 *      objects so a downstream `.toISOString()` is type-safe.
 *   2. Idempotent on already-typed inputs.
 *   3. `null` / `undefined` pass through untouched (so optional
 *      LEFT-JOIN columns don't crash the coercion).
 *   4. The input row is NOT mutated.
 */
describe('coerceRow', () => {
  it("coerces 'date' columns from ISO strings to Date instances", () => {
    const row: Record<string, unknown> = { ts: '2026-06-01T00:00:00.000Z', other: 'x' };
    const out = coerceRow(row, { ts: 'date' });
    expect(out.ts).toBeInstanceOf(Date);
    expect((out.ts as Date).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(out.other).toBe('x');
  });

  it("is idempotent on 'date' columns already shaped as Date", () => {
    const d = new Date('2026-06-01T00:00:00.000Z');
    const out = coerceRow({ ts: d }, { ts: 'date' });
    expect(out.ts).toBe(d);
  });

  it("coerces 'int' columns from strings to numbers", () => {
    const out = coerceRow({ count: '42' }, { count: 'int' });
    expect(out.count).toBe(42);
    expect(typeof out.count).toBe('number');
  });

  it("is idempotent on 'int' columns already typed as number", () => {
    const out = coerceRow({ count: 5 }, { count: 'int' });
    expect(out.count).toBe(5);
  });

  it("coerces 'string' columns from numbers via String()", () => {
    const out = coerceRow({ id: 42 }, { id: 'string' });
    expect(out.id).toBe('42');
  });

  it('passes null and undefined through without touching them', () => {
    const out = coerceRow(
      { ts: null, count: undefined, name: 'kept' },
      { ts: 'date', count: 'int' },
    );
    expect(out.ts).toBeNull();
    expect(out.count).toBeUndefined();
    expect(out.name).toBe('kept');
  });

  it('leaves columns not named in the schema untouched', () => {
    const out = coerceRow(
      { ts: '2026-06-01T00:00:00.000Z', untyped: 'still here' },
      { ts: 'date' },
    );
    expect(out.untyped).toBe('still here');
  });

  it('does not mutate the input row', () => {
    const row = { ts: '2026-06-01T00:00:00.000Z' };
    const out = coerceRow(row, { ts: 'date' });
    expect(row.ts).toBe('2026-06-01T00:00:00.000Z');
    expect(out).not.toBe(row);
  });
});
