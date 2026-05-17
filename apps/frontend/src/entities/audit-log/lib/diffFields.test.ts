import { describe, expect, it } from 'vitest';

import { diffFields } from './diffFields.js';

describe('diffFields', () => {
  it('treats null `before` as all-created', () => {
    const d = diffFields(null, { a: 1, b: 'x' });
    expect(d.created).toEqual(['a', 'b']);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('treats null `after` as all-removed', () => {
    const d = diffFields({ a: 1, b: 'x' }, null);
    expect(d.created).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual(['a', 'b']);
  });

  it('reports only the changed keys', () => {
    const d = diffFields({ a: 1, b: 'x', c: true }, { a: 1, b: 'y', c: true });
    expect(d.created).toEqual([]);
    expect(d.changed).toEqual(['b']);
    expect(d.removed).toEqual([]);
  });

  it('reports created vs removed keys', () => {
    const d = diffFields({ a: 1, b: 'x' }, { a: 1, c: 'new' });
    expect(d.created).toEqual(['c']);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual(['b']);
  });

  it('returns empty arrays when both are null', () => {
    const d = diffFields(null, null);
    expect(d.created).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('considers nested-object equality by JSON.stringify', () => {
    const d = diffFields({ x: { a: 1 } }, { x: { a: 2 } });
    expect(d.changed).toEqual(['x']);
  });
});
