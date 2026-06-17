import { createRoute, Outlet, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';

/**
 * Sysadmin-only layout under `/admin/techniques`. The list, new, and edit
 * pages all sit underneath this route as children, so the sysadmin guard
 * here protects every URL in the subtree. The component is just `<Outlet />`;
 * the actual list page is the index child (`_app.admin.techniques.index.tsx`).
 *
 * Note: the better-auth session user only exposes `role` + `locale` (see
 * `apps/backend/src/infrastructure/auth/better-auth.ts → user.additionalFields`).
 * Memberships live in a separate table and are NOT carried on the session,
 * so a route-level orgadmin check isn't possible without an extra fetch.
 *
 * For Phase 1 we therefore gate this admin route on sysadmin only.
 */
export const adminTechniquesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/techniques',
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

export const Route = adminTechniquesRoute;
