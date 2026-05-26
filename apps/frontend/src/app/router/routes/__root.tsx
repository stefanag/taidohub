import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';

import { FeatureFlagsProvider } from '@/app/providers/FeatureFlagsProvider';

/**
 * Bare root layout. Chrome lives in the `_public` and `_app` layout routes;
 * the root only renders the outlet and the dev-only devtools panel. The
 * `<FeatureFlagsProvider>` wraps everything so anonymous public pages
 * (e.g. `/ranks/:slug`) can read flags too.
 */
function RootComponent(): React.ReactElement {
  return (
    <FeatureFlagsProvider>
      <Outlet />
      {import.meta.env.DEV ? (
        <React.Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
      ) : null}
    </FeatureFlagsProvider>
  );
}

export const rootRoute = createRootRoute({
  component: RootComponent,
});

export const Route = rootRoute;
