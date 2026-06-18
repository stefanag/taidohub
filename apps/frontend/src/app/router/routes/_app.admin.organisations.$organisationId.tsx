import { createRoute, Outlet } from '@tanstack/react-router';

import { adminOrganisationsRoute } from './_app.admin.organisations.js';

/**
 * Layout for everything under `/admin/organisations/$organisationId`.
 * Without this, the codegen makes `…/$organisationId/edit` a child of
 * the view route — but the view component doesn't render `<Outlet />`,
 * so the edit page never mounts. Splitting the view into an
 * `.index.tsx` child + this Outlet-only layout fixes that and lets the
 * edit URL render the edit page as expected.
 */
export const adminOrganisationViewRoute = createRoute({
  getParentRoute: () => adminOrganisationsRoute,
  path: '/$organisationId',
  component: () => <Outlet />,
});

export const Route = adminOrganisationViewRoute;
