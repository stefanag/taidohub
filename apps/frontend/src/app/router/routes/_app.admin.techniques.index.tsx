import { createRoute } from '@tanstack/react-router';

import { adminTechniquesRoute } from './_app.admin.techniques.js';

import { AdminTechniquesListPage } from '@/pages/admin/techniques/list';

/**
 * Index of the `/admin/techniques` layout — the list page. Filter state
 * lives on the URL via `validateSearch`. Codes (not UUIDs) are the
 * user-stable handle, so the URL stays human-readable.
 *
 *   /admin/techniques                              no filters
 *   /admin/techniques?type=taidotechnique          one type
 *   /admin/techniques?type=taidotechnique,kamae    multiple
 *   /admin/techniques?type=…&sotai=sentai&attack=kick
 */
interface TechniquesListSearch {
  type?: string;
  sotai?: string;
  attack?: string;
}

function parseStringOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export const adminTechniquesIndexRoute = createRoute({
  getParentRoute: () => adminTechniquesRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): TechniquesListSearch => {
    const out: TechniquesListSearch = {};
    const type = parseStringOrUndefined(search.type);
    if (type !== undefined) out.type = type;
    const sotai = parseStringOrUndefined(search.sotai);
    if (sotai !== undefined) out.sotai = sotai;
    const attack = parseStringOrUndefined(search.attack);
    if (attack !== undefined) out.attack = attack;
    return out;
  },
  component: AdminTechniquesListPage,
});

export const Route = adminTechniquesIndexRoute;
