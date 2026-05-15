import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';

/**
 * Bare root layout. Chrome lives in the `_public` and `_app` layout routes;
 * the root only renders the outlet and the dev-only devtools panel.
 */
function RootComponent(): React.ReactElement {
  return (
    <>
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
