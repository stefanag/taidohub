import { createRoute, Outlet, useRouterState } from '@tanstack/react-router';
import * as React from 'react';

import { Header } from '@/widgets/header';

import { rootRoute } from './__root.js';

/**
 * Public-facing layout. Used for anonymous pages: `/`, `/login`, and any
 * future marketing route. Renders the global `Header` except on auth pages
 * (`/login`, `/signup`, `/set-password`) — those carry their own hero chrome.
 */
function PublicLayout(): React.ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage =
    pathname === '/login' || pathname === '/signup' || pathname === '/set-password';
  return (
    <>
      {isAuthPage ? null : <Header />}
      <Outlet />
    </>
  );
}

export const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_public',
  component: PublicLayout,
});

export const Route = publicLayoutRoute;
