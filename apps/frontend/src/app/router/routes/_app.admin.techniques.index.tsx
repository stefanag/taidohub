import { createRoute } from '@tanstack/react-router';

import { adminTechniquesRoute } from './_app.admin.techniques.js';

import { AdminTechniquesPage } from '@/pages/admin-techniques';

/**
 * Index of the `/admin/techniques` layout — the actual list page. The
 * parent (`_app.admin.techniques.tsx`) carries the sysadmin guard and an
 * `<Outlet />`, so reaching this route already implies a sysadmin session;
 * no separate `beforeLoad` is needed here.
 */
export const adminTechniquesIndexRoute = createRoute({
  getParentRoute: () => adminTechniquesRoute,
  path: '/',
  component: AdminTechniquesPage,
});

export const Route = adminTechniquesIndexRoute;
