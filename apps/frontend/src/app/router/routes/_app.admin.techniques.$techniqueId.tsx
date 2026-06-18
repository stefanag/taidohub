import { createRoute, Outlet, redirect } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { authClient } from '@/features/auth-by-email';

/**
 * Layout for everything under `/admin/techniques/$techniqueId`. Without
 * this, the codegen makes `…/$techniqueId/edit` a child of the view
 * route — but the view component doesn't render `<Outlet />`, so the
 * edit page never mounts. Splitting the view into an `.index.tsx`
 * child + this Outlet-only layout fixes that and lets the edit URL
 * render the edit page as expected. The sysadmin gate stays here
 * defensively, same shape as the other admin routes.
 */
export const adminTechniqueViewRoute = createRoute({
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
  component: () => <Outlet />,
});

export const Route = adminTechniqueViewRoute;
