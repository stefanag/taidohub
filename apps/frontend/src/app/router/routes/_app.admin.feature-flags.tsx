import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminFeatureFlagsPage } from '@/pages/admin-feature-flags';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the feature-flag admin page. Sits under `_app` so
 * the parent's session check still applies; this `beforeLoad` layers a
 * sysadmin check on top and redirects everyone else to `/dashboard`. Mirrors
 * the pattern in `_app.admin.audit-log.tsx` / `_app.admin.users.tsx`.
 */
export const adminFeatureFlagsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/feature-flags',
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
  component: AdminFeatureFlagsPage,
});

export const Route = adminFeatureFlagsRoute;
