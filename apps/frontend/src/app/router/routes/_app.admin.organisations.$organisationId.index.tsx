import { createRoute } from '@tanstack/react-router';

import { adminOrganisationViewRoute } from './_app.admin.organisations.$organisationId.js';

import { AdminOrganisationViewPage } from '@/pages/admin/organisations/view';

/** Index of `/admin/organisations/$organisationId` — the read-only view. */
export const adminOrganisationViewIndexRoute = createRoute({
  getParentRoute: () => adminOrganisationViewRoute,
  path: '/',
  component: AdminOrganisationViewPage,
});

export const Route = adminOrganisationViewIndexRoute;
