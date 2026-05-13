import { AbilityProvider } from './providers/AbilityProvider.js';
import { AuthProvider } from './providers/AuthProvider.js';
import { QueryProvider } from './providers/QueryProvider.js';
import { RouterProvider } from './providers/RouterProvider.js';

/**
 * Composition root.
 *
 * Provider order matters: `QueryProvider` first (so any provider below can
 * use TanStack Query if it wants), then `AuthProvider` (presently a
 * pass-through — see file), then `AbilityProvider` (depends on the session
 * exposed by better-auth), then the `RouterProvider`.
 */
export function App(): React.ReactElement {
  return (
    <QueryProvider>
      <AuthProvider>
        <AbilityProvider>
          <RouterProvider />
        </AbilityProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
