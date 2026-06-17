import { createRoute, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';
import { AdminTechniqueNewPage } from '@/pages/admin-technique-new';

/**
 * Sysadmin-only route for the technique create page. Reuses the same gate
 * shape as the list route (`_app.admin.techniques.tsx`).
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
