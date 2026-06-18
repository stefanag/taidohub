import { createRoute, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';
import { AdminTechniqueEditPage } from '@/pages/admin/techniques/edit';

/** Sysadmin-only route for the technique edit page. */
export const adminTechniqueEditRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/techniques/$techniqueId/edit',
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
