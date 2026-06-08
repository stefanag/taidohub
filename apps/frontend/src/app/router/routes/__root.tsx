import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';

import { FeatureFlagsProvider } from '@/app/providers/FeatureFlagsProvider';

/**
 * Bare root layout. Chrome lives in the `_public` and `_app` layout routes;
 * the root only renders the outlet and the dev-only devtools panel. The
 * `<FeatureFlagsProvider>` wraps everything so anonymous public pages
 * (e.g. `/ranks/:slug`) can read flags too.
 *
 * The provider suspends at app boot while it fetches the resolved flag map
 * from `GET /api/feature-flags`, so we wrap it in a `<Suspense>` boundary
 * with a minimal loading fallback.
 */
function RootComponent(): React.ReactElement {
  return (
    <React.Suspense
      fallback={
        <div className="container py-12 text-center text-on-surface-variant">Loading…</div>
      }
    >
      <FeatureFlagsProvider>
        <Outlet />
        {import.meta.env.DEV ? (
          <React.Suspense fallback={null}>
            <TanStackRouterDevtools position="bottom-right" />
          </React.Suspense>
        ) : null}
      </FeatureFlagsProvider>
    </React.Suspense>
  );
}

export const rootRoute = createRootRoute({
  component: RootComponent,
});

export const Route = rootRoute;
