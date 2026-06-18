import { createRoute, Outlet } from '@tanstack/react-router';

import { adminPatternsRoute } from './_app.admin.patterns.js';

/**
 * Layout for everything under `/admin/patterns/$patternId`. Without
 * this, the codegen makes `…/$patternId/edit` a child of the view
 * route — but the view component doesn't render `<Outlet />`, so the
 * edit page never mounts. Splitting the view into an `.index.tsx`
 * child + this Outlet-only layout fixes that and lets the edit URL
 * render the edit page as expected.
 */
export const adminPatternViewRoute = createRoute({
  getParentRoute: () => adminPatternsRoute,
  path: '/$patternId',
  component: () => <Outlet />,
});

export const Route = adminPatternViewRoute;
