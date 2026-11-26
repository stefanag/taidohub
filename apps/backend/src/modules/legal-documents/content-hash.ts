import { createHash } from 'node:crypto';

/**
 * JSON with object keys sorted at every level, so the same content always
 * serialises the same way. Postgres jsonb reorders keys, which is why the hash
 * is computed from this form when a translation is written and then stored.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** sha256 (hex) of a translation's title and body. */
export function translationHash(title: string, body: unknown): string {
  return createHash('sha256').update(canonicalJson({ title, body })).digest('hex');
}
