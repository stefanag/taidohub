import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';

import { Header } from '@/widgets/header';

// Routes that should render full-bleed without the global app Header
// (e.g. auth pages with their own hero layout).
const ROUTES_WITHOUT_HEADER = new Set(['/login', '/signup']);

function RootComponent(): React.ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showHeader = !ROUTES_WITHOUT_HEADER.has(pathname);

  return (
    <>
      {showHeader ? <Header /> : null}
      <Outlet />
      {import.meta.env.DEV ? (
        <React.Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
      ) : null}
    </>
  );
}

export const rootRoute = createRootRoute({
  component: RootComponent,
});

export const Route = rootRoute;
