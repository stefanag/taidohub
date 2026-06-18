import { createRoute } from '@tanstack/react-router';

import { adminOrganisationsRoute } from './_app.admin.organisations.js';

import { AdminOrganisationsListPage } from '@/pages/admin/organisations/list';

/**
 * Normalises `?tag=` / `?category=` query into `string[] | undefined`.
 * Browsers may serialise a single-value filter as a bare string
 * (`?tag=foo`) or as a repeated key (`?tag=foo&tag=bar`) which lands as
 * an array. The filter UI and the contracts (`LabelFilterSchema`) both
 * consume `string[]`, so we coerce both shapes here.
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

export const adminOrganisationsIndexRoute = createRoute({
  getParentRoute: () => adminOrganisationsRoute,
  path: '/',
  validateSearch: (input: Record<string, unknown>): AdminOrganisationsSearch => {
    const tag = normaliseStringArray(input.tag);
    const category = normaliseStringArray(input.category);
    return {
      ...(tag !== undefined && { tag }),
      ...(category !== undefined && { category }),
    };
  },
  component: AdminOrganisationsListPage,
});

export const Route = adminOrganisationsIndexRoute;
