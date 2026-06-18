import { createRoute } from '@tanstack/react-router';

import { adminPatternViewRoute } from './_app.admin.patterns.$patternId.js';

import { AdminPatternViewPage } from '@/pages/admin/patterns/view';

/** Index of `/admin/patterns/$patternId` — the read-only view. */
export const adminPatternViewIndexRoute = createRoute({
  getParentRoute: () => adminPatternViewRoute,
  path: '/',
  component: AdminPatternViewPage,
});

export const Route = adminPatternViewIndexRoute;
