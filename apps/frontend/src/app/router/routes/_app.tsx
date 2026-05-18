import { createRoute, Outlet, redirect } from '@tanstack/react-router';
import * as React from 'react';

import { authClient } from '@/features/auth-by-email';
import { SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { AppSidebar } from '@/widgets/appsidebar';

import { rootRoute } from './__root.js';

/**
 * Auth-gated layout. Every route under this parent runs through the
 * `beforeLoad` check below and renders inside the shadcn sidebar shell.
 *
 * Layout: `<AppSidebar>` (left, persistent on desktop, Sheet on mobile) +
 * main area carrying a mobile-only `<SidebarTrigger>` floating top-left so
 * a collapsed sidebar can be re-opened.
 */
function AppLayout(): React.ReactElement {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="min-h-svh flex-1">
        <div className="sticky top-2 left-2 z-10 w-fit md:hidden">
          <SidebarTrigger />
        </div>
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async () => {
    // Network/server failure is treated as "no session" so the user lands
    // on /login rather than a blank error screen.
    let hasSession = false;
    try {
      const result = await authClient.getSession();
      hasSession = Boolean(result.data);
    } catch {
      /* swallow — `hasSession` stays false */
    }
    if (!hasSession) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

export const Route = appLayoutRoute;
