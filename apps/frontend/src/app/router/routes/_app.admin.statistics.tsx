import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminStatisticsPage } from '@/pages/admin-statistics';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the platform statistics page. Sits under `_app`
 * so the parent's session check still applies; this `beforeLoad` layers a
 * sysadmin check on top and redirects everyone else to `/dashboard`. Mirrors
 * the pattern in `_app.admin.feature-flags.tsx` / `_app.admin.audit-log.tsx`.
 */
export const adminStatisticsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/statistics',
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
  component: AdminStatisticsPage,
});

export const Route = adminStatisticsRoute;
