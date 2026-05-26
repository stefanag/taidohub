import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminBeltCatalogPage } from '@/pages/admin-belt-catalog';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the belt-catalog hub. Sits under `_app` so the
 * parent's session check still applies; this `beforeLoad` layers a sysadmin
 * check on top and redirects everyone else to `/dashboard`.
 */
export const adminBeltCatalogRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/belt-catalog',
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
  component: AdminBeltCatalogPage,
});

export const Route = adminBeltCatalogRoute;
