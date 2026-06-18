import { createRoute, Outlet, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';

/**
 * Sysadmin-only layout under `/admin/patterns`. The list, new, view, and
 * edit pages all sit underneath this route as children, so the sysadmin
 * guard here protects every URL in the subtree. The component is just
 * `<Outlet />`; the actual list page is the index child
 * (`_app.admin.patterns.index.tsx`).
 */
export const adminPatternsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/patterns',
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

export const Route = adminPatternsRoute;
