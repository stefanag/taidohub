import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminUsersPage } from '@/pages/admin-users';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the user-management page. Sits under `_app` so the
 * parent's session check still applies; this `beforeLoad` layers a sysadmin
 * check on top and redirects everyone else to `/dashboard`.
 */
export const adminUsersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/users',
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
  component: AdminUsersPage,
});

export const Route = adminUsersRoute;
