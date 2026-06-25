import { createRoute, Outlet, redirect } from '@tanstack/react-router';
import * as React from 'react';

import { authClient } from '@/features/auth-by-email';
import { SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { AppSidebar } from '@/widgets/appsidebar';
import { FeedbackBadge } from '@/widgets/feedback-badge';

import { rootRoute } from './__root.js';

/**
 * Auth-gated layout. Every route under this parent runs through the
 * `beforeLoad` check below and renders inside the shadcn sidebar shell.
 *
 * Layout: `<AppSidebar>` (left, persistent on desktop, Sheet on mobile) +
 * main area with a slim top bar carrying the mobile `<SidebarTrigger>`
 * (left) and the `<FeedbackBadge>` (right, both viewports). The bar is
 * sticky so the badge stays visible as the page scrolls. The badge
 * self-hides when the `instructor-feedback` feature flag is off.
 */
function AppLayout(): React.ReactElement {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="min-h-svh flex-1">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-outline-variant/30 bg-surface/80 px-2 py-1 backdrop-blur">
          <div className="md:hidden">
            <SidebarTrigger />
          </div>
          <div className="ml-auto">
            <FeedbackBadge />
          </div>
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
