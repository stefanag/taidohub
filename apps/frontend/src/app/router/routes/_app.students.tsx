import { createRoute, Outlet } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

/**
 * Layout under `/students`. The roster index + the per-student detail
 * sit underneath as siblings. Without this Outlet wrapper, the codegen
 * makes `/students/$userId` a child of the roster route — and the roster
 * page renders no `<Outlet />`, so the URL changes but the detail page
 * never mounts. Same fix shape as `_app.admin.<resource>.tsx`.
 *
 * The auth session is still required (inherited from `appLayoutRoute`);
 * the backend handles the per-route authorisation (instructors see their
 * roster, sysadmin sees everyone, others get 403).
 */
export const studentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/students',
  component: () => <Outlet />,
});

export const Route = studentsRoute;
