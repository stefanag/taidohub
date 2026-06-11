import { createRoute, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';
import { AdminPatternsPage } from '@/pages/admin-patterns';


/**
 * Sysadmin-only route mounting the pattern-admin page. Sits under `_app`
 * so the parent's session check still applies; this `beforeLoad` layers a
 * sysadmin check on top.
 *
 * Note: the better-auth session user only exposes `role` + `locale` (see
 * `apps/backend/src/infrastructure/auth/better-auth.ts → user.additionalFields`).
 * Memberships live in a separate table and are NOT carried on the session,
 * so a route-level orgadmin check isn't possible without an extra fetch.
 *
 * For Phase 2 we therefore gate this admin route on sysadmin only — same
 * caveat documented on `_app.admin.techniques.tsx`.
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
  component: AdminPatternsPage,
});

export const Route = adminPatternsRoute;
