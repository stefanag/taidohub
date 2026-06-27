/**
 * Column-type coercion for rows returned by `db.execute(sql\`...\`)`.
 *
 * # Why this exists
 *
 * Drizzle's query-builder path (`db.select(...).from(...)`) reads
 * the column metadata off the schema and coerces values to JS
 * shapes — `timestamp` → `Date`, `integer` → `number`, `jsonb` →
 * parsed object. That coercion does NOT happen on `db.execute`,
 * which is the raw-SQL escape hatch. The fields land in your code
 * as whatever postgres-js returns: timestamps as ISO strings,
 * integers as strings or numbers depending on the column type,
 * booleans as booleans, text as text.
 *
 * We hit this exact trap during the feedback inbox work: a
 * service called `.toISOString()` on what its TS type advertised
 * as a `Date` but was actually the string postgres-js returned,
 * and the request 500'd at runtime. The fix at the call site was
 * `new Date(r.last_activity_at).toISOString()` — idempotent on
 * both strings and Date inputs.
 *
 * Centralising the fix as a helper:
 *   - makes the coercion visible at the repo boundary (where the
 *     `db.execute` is) instead of leaking through to the service;
 *   - lets the TS type of the row reflect the coerced shape
 *     (e.g. `last_activity_at: Date`) so a future caller's
 *     `.toISOString()` is type-safe by construction;
 *   - one place to extend when we discover the next column type
 *     postgres-js hands back in an unexpected shape.
 *
 * # Contract
 *
 * Pass a row + a small schema mapping each column to its target
 * type. Returns a new row (no mutation) with the named columns
 * coerced. Columns not named in the schema pass through verbatim.
 * `null` and `undefined` are preserved — coercion only applies to
 * present values.
 */

/** Supported coercion targets. Add a case here + a branch below when expanding. */
export type CoerceColumnType = 'date' | 'int' | 'string';

export type CoerceSchema<TRow> = Partial<Record<keyof TRow, CoerceColumnType>>;

/**
 * Returns a new row with the columns named in `schema` coerced to
 * the requested JS type. Idempotent on values that already match
 * the target shape (e.g. a `Date` input for a `'date'` column is
 * returned unchanged).
 */
export function coerceRow<TRow extends Record<string, unknown>>(
  row: TRow,
  schema: CoerceSchema<TRow>,
): TRow {
  const out: Record<string, unknown> = { ...row };
  for (const [col, type] of Object.entries(schema)) {
    const v = out[col];
    if (v === null || v === undefined) continue;
    switch (type) {
      case 'date':
        out[col] = v instanceof Date ? v : new Date(v as string);
        break;
      case 'int':
        out[col] = typeof v === 'number' ? v : Number(v);
        break;
      case 'string':
        out[col] = typeof v === 'string' ? v : String(v);
        break;
    }
  }
  return out as TRow;
}
