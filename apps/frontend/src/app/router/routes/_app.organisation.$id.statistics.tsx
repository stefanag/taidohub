import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { OrganisationStatisticsPage } from '@/pages/organisation-statistics';

/**
 * Org-scope statistics route, open to any authenticated user (sits under
 * `_app` so the parent's session check still applies). Unlike
 * `_app.admin.statistics.tsx` this has no `beforeLoad` role guard — access
 * is per-instance (sysadmin OR `manage Organisation` on `:id`) and is
 * enforced by the backend; the page renders the 403 the queries return as
 * an inline "access denied" message instead of a redirect.
 */
export const organisationStatisticsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/organisation/$id/statistics',
  component: OrganisationStatisticsPage,
});

export const Route = organisationStatisticsRoute;
