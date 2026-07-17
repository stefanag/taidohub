import type { MongoAbility } from '@casl/ability';
import { Can, AbilityProvider as CaslAbilityProvider } from '@casl/react';
import * as React from 'react';

import type { AppAbilityTuple } from '@repo/contracts/casl';

export type AppAbility = MongoAbility<AppAbilityTuple>;

/**
 * React context that carries the current user's CASL ability. Default value
 * is `null` — consumers should always be inside an `<AbilityProvider>` (see
 * below) supplied by `app/providers/AbilityProvider.tsx`, but keeping the
 * `| null` default lets tests render a component without providing an
 * ability at all (they null-check and skip permission-gated branches).
 *
 * CASL 7's own `useAbility()` throws when unwrapped, so this context is not
 * a shim over CASL's internal one — it is the source of truth for our
 * null-tolerant consumers.
 */
export const AbilityContext = React.createContext<AppAbility | null>(null);

/**
 * Wraps children in BOTH our own null-tolerant `AbilityContext` (for
 * `React.useContext(AbilityContext)` callers) AND CASL 7's internal
 * `AbilityProvider` (which `<Can>` reads from and which is not swappable).
 * The single `value` is fed to both.
 */
export function AbilityProvider({
  value,
  children,
}: {
  value: AppAbility;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <AbilityContext.Provider value={value}>
      <CaslAbilityProvider value={value}>{children}</CaslAbilityProvider>
    </AbilityContext.Provider>
  );
}

export { Can };
