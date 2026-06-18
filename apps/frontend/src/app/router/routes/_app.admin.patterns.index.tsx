import { createRoute } from '@tanstack/react-router';

import { adminPatternsRoute } from './_app.admin.patterns.js';

import { AdminPatternsListPage } from '@/pages/admin/patterns/list';

/**
 * Filter state lives on the URL via TanStack's `useSearch`. Codes (not
 * UUIDs) are the user-stable handle, so the URL survives classification
 * ID changes and stays human-readable.
 *
 *   /admin/patterns                 → no filters
 *   /admin/patterns?type=hokei,kobo → filter to hokei OR kobo
 *   /admin/patterns?type=hokei&subtype=yo
 *                                   → hokei type with yo subtype
 *
 * Unknown keys are dropped during validation; an empty key emits as
 * `undefined` (TanStack strips it from the URL).
 */
interface PatternsListSearch {
  type?: string;
  subtype?: string;
}

function parseStringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export const adminPatternsIndexRoute = createRoute({
  getParentRoute: () => adminPatternsRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): PatternsListSearch => {
    // `exactOptionalPropertyTypes` rejects `{ key: undefined }` — only set
    // keys that actually carry a value, otherwise leave them absent.
    const out: PatternsListSearch = {};
    const type = parseStringOrUndefined(search.type);
    if (type !== undefined) out.type = type;
    const subtype = parseStringOrUndefined(search.subtype);
    if (subtype !== undefined) out.subtype = subtype;
    return out;
  },
  component: AdminPatternsListPage,
});

export const Route = adminPatternsIndexRoute;
