import { createRoute } from '@tanstack/react-router';

import { adminOrganisationsRoute } from './_app.admin.organisations.js';

import { AdminOrganisationViewPage } from '@/pages/admin/organisations/view';

export const adminOrganisationViewRoute = createRoute({
  getParentRoute: () => adminOrganisationsRoute,
  path: '/$organisationId',
  component: AdminOrganisationViewPage,
});

export const Route = adminOrganisationViewRoute;
