import { createRoute, Outlet } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

/**
 * Layout under `/admin/rank-requirements`. The list page (selectors +
 * embedded editor) is the index child
 * (`_app.admin.rank-requirements.index.tsx`); this file only renders
 * `<Outlet />` — same fix shape as every other `_app.admin.<resource>.tsx`
 * layout (see `_app.admin.requirement-sets.tsx`, `_app.admin.patterns.tsx`).
 * Without it the codegen still nests the index route as a child, but since
 * this parent's component wouldn't render `<Outlet />`, the child would
 * silently never mount.
 *
 * No sysadmin-only `beforeLoad` here: like `/admin/requirement-sets`,
 * `RankRequirement` is manageable by both sysadmins and org-scoped
 * orgadmins/instructors, so the route only inherits the session check from
 * `appLayoutRoute`. The page itself derives visibility the same way the
 * sidebar does (CASL ability + `useMyMembershipsQuery`).
 */
export const adminRankRequirementsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/rank-requirements',
  component: () => <Outlet />,
});

export const Route = adminRankRequirementsRoute;
