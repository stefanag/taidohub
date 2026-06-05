/**
 * Re-export Quill's own `Delta` type so callers have one canonical name to
 * import from this slice. Quill 2 ships its types under `quill/core`.
 */
export type { Delta } from 'quill/core';

import type { Delta } from 'quill/core';

/**
 * The canonical empty Delta. Quill represents an empty document with a
 * single trailing newline insert.
 */
export function emptyDelta(): Delta {
  return { ops: [{ insert: '\n' }] } as Delta;
}

/**
 * True when the Delta has no user-authored content — i.e. either no ops, or
 * only string inserts that consist of whitespace, AND no attributes anywhere.
 * The "single trailing newline" case is covered (it is whitespace + no
 * attributes). Embeds (non-string inserts) and any formatting attributes on
 * any op count as non-empty.
 */
export function isEmpty(d: Delta): boolean {
  if (!d.ops || d.ops.length === 0) return false;
  for (const op of d.ops) {
    if (op.attributes && Object.keys(op.attributes).length > 0) return false;
    if (typeof op.insert !== 'string') return false;
    if (op.insert.replace(/\s+/g, '') !== '') return false;
  }
  return true;
}
