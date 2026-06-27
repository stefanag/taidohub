import { z } from './zod-openapi.js';

/**
 * Standard list-response wrapper for HTTP endpoints that return a
 * page of items. Every new list endpoint should use this shape;
 * existing endpoints can migrate incrementally.
 *
 * Two fields:
 *
 *   - `data`: the items on this page.
 *   - `nextCursor`: opaque cursor for the next page, or `null` when
 *     the current page is the last one. The cursor's content is
 *     deliberately not specified — implementations are free to use
 *     `last_id`, an opaque base64-encoded blob, or anything that
 *     round-trips through a URL query string. Clients must treat it
 *     as a literal handle and not parse it.
 *
 * Cursor-based pagination (not offset/limit) is the right shape
 * here. Offset pagination is straightforward for clients but breaks
 * down at scale: large offsets force the database to scan all
 * skipped rows, and concurrent inserts shift items between pages.
 * Cursor pagination has neither problem and clients pay the same
 * complexity cost in both schemes (just pass the previous response's
 * cursor along on the next request).
 *
 * # Usage
 *
 * ```ts
 * import { paginated } from './paginated.js';
 *
 * export const FeedbackInboxResponseSchema = paginated(
 *   FeedbackInboxItemSchema,
 *   { id: 'FeedbackInboxResponse', description: '...' },
 * );
 * ```
 *
 * The helper returns a Zod schema that consumers can `.parse(raw)`
 * against. The wrapper's OpenAPI `id` and `description` flow
 * through via the `.meta(...)` annotation.
 */

export interface PaginatedSchemaOptions {
  /** OpenAPI schema id (for `$ref` reuse in the generated spec). */
  id?: string;
  /** OpenAPI description rendered on the schema. */
  description?: string;
}

export function paginated<T extends z.ZodTypeAny>(
  itemSchema: T,
  options: PaginatedSchemaOptions = {},
) {
  const wrapper = z.object({
    data: itemSchema.array(),
    nextCursor: z.string().nullable(),
  });
  if (options.id !== undefined || options.description !== undefined) {
    return wrapper.meta({
      ...(options.id !== undefined ? { id: options.id } : {}),
      ...(options.description !== undefined ? { description: options.description } : {}),
    });
  }
  return wrapper;
}

/**
 * TypeScript shape produced by {@link paginated}. Useful as a return
 * type on service methods that don't need to import the Zod schema.
 */
export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}
