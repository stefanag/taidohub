import { createRoute } from '@tanstack/react-router';

import { adminTechniqueViewRoute } from './_app.admin.techniques.$techniqueId.js';

import { AdminTechniqueViewPage } from '@/pages/admin/techniques/view';

/** Index of `/admin/techniques/$techniqueId` — the read-only view. */
export const adminTechniqueViewIndexRoute = createRoute({
  getParentRoute: () => adminTechniqueViewRoute,
  path: '/',
  component: AdminTechniqueViewPage,
});

export const Route = adminTechniqueViewIndexRoute;
