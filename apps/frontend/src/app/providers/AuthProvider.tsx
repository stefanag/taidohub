import * as React from 'react';

/**
 * `AuthProvider` is intentionally a pass-through.
 *
 * better-auth's React client (`createAuthClient`) is **stateless** — it does
 * not require a wrapping provider. We expose this component anyway because:
 *   1. The spec calls for a discrete `AuthProvider` so other providers can be
 *      slotted in here later (e.g. wrap with an org/role provider).
 *   2. Consumers can mount it once at the app root without thinking about
 *      "do I need a provider for hooks like `useSession`?".
 *
 * Session is hydrated automatically by `useSession()` (called from
 * `widgets/header` and `AbilityProvider`).
 */
export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}
