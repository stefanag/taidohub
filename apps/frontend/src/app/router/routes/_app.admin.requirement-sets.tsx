import { createRoute, Outlet } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

/**
 * Layout under `/admin/requirement-sets`. The list page is the index
 * child (`_app.admin.requirement-sets.index.tsx`); this file only renders
 * `<Outlet />`. Without it the codegen still nests the index route as a
 * child, but since this parent's component wouldn't render `<Outlet />`,
 * the child would silently never mount — same fix shape as every other
 * `_app.admin.<resource>.tsx` layout (see `_app.admin.patterns.tsx`,
 * `_app.students.tsx`).
 *
 * No sysadmin-only `beforeLoad` here: `RequirementSet` is manageable by
 * both sysadmins and org-scoped orgadmins/instructors (see
 * `GradingRequirementsAbilityRules` on the backend), so — like
 * `/my-organisation` and `/students` — the route only inherits the
 * session check from `appLayoutRoute`. The page itself derives
 * visibility from the CASL ability plus `useMyMembershipsQuery`.
 */
export const adminRequirementSetsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/requirement-sets',
  component: () => <Outlet />,
});

export const Route = adminRequirementSetsRoute;
