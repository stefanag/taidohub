import { createRoute } from '@tanstack/react-router';

import { adminOrganisationsRoute } from './_app.admin.organisations.js';

import { AdminOrganisationEditPage } from '@/pages/admin/organisations/edit';

export const adminOrganisationEditRoute = createRoute({
  getParentRoute: () => adminOrganisationsRoute,
  path: '/$organisationId/edit',
  component: AdminOrganisationEditPage,
});

export const Route = adminOrganisationEditRoute;
