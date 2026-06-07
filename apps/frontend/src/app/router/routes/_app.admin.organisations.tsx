import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminOrganisationsPage } from '@/pages/admin-organisations';

import { appLayoutRoute } from './_app.js';

/**
 * Normalises the `?tag=` / `?category=` query into `string[] | undefined`.
 * Browsers may serialise a single-value filter as a bare string (`?tag=foo`)
 * or as a repeated key (`?tag=foo&tag=bar`) which lands as an array. The
 * filter UI and the contracts (LabelFilterSchema) both consume `string[]`,
 * so we coerce both shapes here. Unknown shapes (numbers, booleans) collapse
 * to `undefined` rather than throw — TanStack Router is permissive on
 * search-param decode and we'd rather a bad URL just shows no filter.
 */
function normaliseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return undefined;
}

interface AdminOrganisationsSearch {
  tag?: string[];
  category?: string[];
}

export const adminOrganisationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/organisations',
  validateSearch: (input: Record<string, unknown>): AdminOrganisationsSearch => {
    const tag = normaliseStringArray(input.tag);
    const category = normaliseStringArray(input.category);
    // exactOptionalPropertyTypes: omit the key entirely when the value would
    // be `undefined` rather than serialising `{ tag: undefined }`.
    return {
      ...(tag !== undefined && { tag }),
      ...(category !== undefined && { category }),
    };
  },
  beforeLoad: async () => {
    try {
      const result = await authClient.getSession();
      // better-auth's default user type may not include `role`; cast safely.
      const role = (result.data?.user as { role?: string } | undefined)?.role;
      if (role !== 'sysadmin') {
        throw redirect({ to: '/dashboard' });
      }
    } catch (err) {
      // Re-throw redirects (they carry an `options` shape); swallow network
      // errors and bounce to /login so we don't show a blank screen.
      if (err && typeof err === 'object' && 'options' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: AdminOrganisationsPage,
});

export const Route = adminOrganisationsRoute;
