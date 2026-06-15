import { createRoute } from '@tanstack/react-router';

import { MyOrganisationPage } from '@/pages/my-organisation';

import { appLayoutRoute } from './_app.js';

/**
 * Orgadmin-facing self-service page. Mounts under the existing `_app`
 * layout so the session check + sidebar shell are inherited. The page
 * itself derives the active orgadmin orgs from `useMyMembershipsQuery`
 * and short-circuits to a friendly empty state when the caller is not
 * an orgadmin anywhere.
 */
export const myOrganisationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/my-organisation',
  component: MyOrganisationPage,
});

export const Route = myOrganisationRoute;
