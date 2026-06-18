import { createRoute } from '@tanstack/react-router';

import { adminOrganisationsRoute } from './_app.admin.organisations.js';

import { AdminOrganisationNewPage } from '@/pages/admin/organisations/new';

export const adminOrganisationNewRoute = createRoute({
  getParentRoute: () => adminOrganisationsRoute,
  path: '/new',
  component: AdminOrganisationNewPage,
});

export const Route = adminOrganisationNewRoute;
