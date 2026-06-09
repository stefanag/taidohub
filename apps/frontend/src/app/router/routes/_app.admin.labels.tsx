import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminLabelsPage } from '@/pages/admin-labels';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the system-wide labels admin page. Sysadmin
 * check layered on top of the `_app` session check; mirrors the pattern in
 * `_app.admin.feature-flags.tsx`.
 */
export const adminLabelsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/labels',
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
  component: AdminLabelsPage,
});

export const Route = adminLabelsRoute;
