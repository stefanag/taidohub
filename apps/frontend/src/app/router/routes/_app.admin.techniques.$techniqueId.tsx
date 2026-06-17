import { createRoute, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';
import { AdminTechniqueEditPage } from '@/pages/admin-technique-edit';

/**
 * Sysadmin-only route for the technique edit page. Reuses the same gate
 * shape as the list route (`_app.admin.techniques.tsx`).
 */
export const adminTechniqueEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/techniques/$techniqueId',
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
  component: AdminTechniqueEditPage,
});

export const Route = adminTechniqueEditRoute;
