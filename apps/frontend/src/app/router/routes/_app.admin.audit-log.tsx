import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminAuditLogPage } from '@/pages/admin-audit-log';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the audit-log page. Sits under `_app` so the
 * parent's session check still applies; this `beforeLoad` layers a role
 * check on top and redirects non-admins to `/dashboard`.
 */
export const adminAuditLogRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/audit-log',
  beforeLoad: async () => {
    try {
      const result = await authClient.getSession();
      // better-auth's default user type may not include `role`; cast safely.
      const role = (result.data?.user as { role?: string } | undefined)?.role;
      if (role !== 'admin') {
        throw redirect({ to: '/dashboard' });
      }
    } catch (err) {
      // Re-throw redirects (they carry an `options` shape); swallow network
      // errors and bounce to /login so we don't show a blank screen.
      if (err && typeof err === 'object' && 'options' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: AdminAuditLogPage,
});

export const Route = adminAuditLogRoute;
