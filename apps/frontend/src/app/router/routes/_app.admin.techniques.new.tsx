import { createRoute, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';
import { AdminTechniqueNewPage } from '@/pages/admin/techniques/new';

/**
 * Sysadmin-only route for the technique create page. The sysadmin gate
 * here is redundant with the parent (`_app.admin.techniques.tsx`) — the
 * codegen flattens this child under that layout — but kept as a belt-
 * and-braces defence against routing-config drift.
 */
export const adminTechniqueNewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/techniques/new',
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
  component: AdminTechniqueNewPage,
});

export const Route = adminTechniqueNewRoute;
