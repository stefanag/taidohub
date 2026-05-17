export interface FieldDiff {
  created: string[];
  changed: string[];
  removed: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compare two snapshots (either may be `null` for create/delete cases) and
 * report which top-level keys were created, changed or removed. Nested
 * object comparison is JSON-equality — good enough for the row-level
 * "+1 / ~3 / -0" summary in the audit log table.
 */
export function diffFields(before: unknown | null, after: unknown | null): FieldDiff {
  const beforeKeys = isRecord(before) ? Object.keys(before) : [];
  const afterKeys = isRecord(after) ? Object.keys(after) : [];

  const beforeSet = new Set(beforeKeys);
  const afterSet = new Set(afterKeys);

  const created = afterKeys.filter((k) => !beforeSet.has(k));
  const removed = beforeKeys.filter((k) => !afterSet.has(k));
  const changed = afterKeys
    .filter((k) => beforeSet.has(k))
    .filter((k) =>
      !equal((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k]),
    );

  return { created, changed, removed };
}
