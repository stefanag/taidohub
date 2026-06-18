import { createRoute, Outlet, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';

/**
 * Sysadmin-only layout under `/admin/organisations`. The list, new, view,
 * and edit pages all sit underneath this route as children. The
 * sysadmin guard here covers every URL in the subtree; the component is
 * just `<Outlet />`.
 */
export const adminOrganisationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/organisations',
  beforeLoad: async () => {
    try {
      const result = await authClient.getSession();
      const role = (result.data?.user as { role?: string } | undefined)?.role;
      if (role !== 'sysadmin') {
        throw redirect({ to: '/dashboard' });
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'options' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />,
});

export const Route = adminOrganisationsRoute;
