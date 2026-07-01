import { createRoute } from '@tanstack/react-router';

import { adminRequirementSetsRoute } from './_app.admin.requirement-sets.js';

import { AdminRequirementSetsPage } from '@/pages/admin-requirement-sets';

export const adminRequirementSetsIndexRoute = createRoute({
  getParentRoute: () => adminRequirementSetsRoute,
  path: '/',
  component: AdminRequirementSetsPage,
});

export const Route = adminRequirementSetsIndexRoute;
