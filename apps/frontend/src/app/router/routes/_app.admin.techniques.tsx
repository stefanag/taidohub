import { createRoute, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';
import { AdminTechniquesPage } from '@/pages/admin-techniques';


/**
 * Sysadmin-only route mounting the technique-admin page. Sits under `_app`
 * so the parent's session check still applies; this `beforeLoad` layers a
 * sysadmin check on top.
 *
 * Note: the better-auth session user only exposes `role` + `locale` (see
 * `apps/backend/src/infrastructure/auth/better-auth.ts → user.additionalFields`).
 * Memberships live in a separate table and are NOT carried on the session,
 * so a route-level orgadmin check isn't possible without an extra fetch.
 *
 * For Phase 1 we therefore gate this admin route on sysadmin only. The
 * orgadmin CRUD path is intended to flow through the read-only `/techniques`
 * page once that surface grows row-level admin actions — but, again, until
 * the CASL `defineAbilityFor` learns about org memberships, the in-app gate
 * also resolves only for sysadmin. Both gates therefore agree.
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
  component: AdminTechniquesPage,
});

export const Route = adminTechniquesRoute;
