import { describe, expect, it } from 'vitest';

import { emptyDelta, isEmpty, type Delta } from './delta.js';

describe('emptyDelta', () => {
  it('returns a delta with a single newline insert', () => {
    expect(emptyDelta()).toEqual({ ops: [{ insert: '\n' }] });
  });

  it('returns a fresh object on each call', () => {
    expect(emptyDelta()).not.toBe(emptyDelta());
  });
});

describe('isEmpty', () => {
  it('is true for the canonical empty delta', () => {
    expect(isEmpty(emptyDelta())).toBe(true);
  });

  it('is true for a delta with only whitespace inserts', () => {
    expect(isEmpty({ ops: [{ insert: '   \n' }] } as unknown as Delta)).toBe(true);
  });

  it('is false for a delta with user-authored text', () => {
    expect(isEmpty({ ops: [{ insert: 'hello' }, { insert: '\n' }] } as unknown as Delta)).toBe(false);
  });

  it('is false for a delta with formatted-but-empty content (e.g. a header)', () => {
    expect(
      isEmpty(
        {
          ops: [{ insert: '\n', attributes: { header: 2 } }],
        } as unknown as Delta,
      ),
    ).toBe(false);
  });

  it('is false for a delta with no ops', () => {
    expect(isEmpty({ ops: [] } as unknown as Delta)).toBe(false);
  });

  it('is false for a delta whose ops contain non-string inserts (embeds)', () => {
    expect(isEmpty({ ops: [{ insert: { image: 'x' } }, { insert: '\n' }] } as unknown as Delta)).toBe(false);
  });
});
