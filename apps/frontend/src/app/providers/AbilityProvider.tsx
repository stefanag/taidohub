import * as React from 'react';

import { useSession } from '@/features/auth-by-email';
import {
  AbilityProvider as CaslAbilityProvider,
  defineAbilityFor,
  type AbilityUser,
} from '@/shared/lib/casl';

export interface AbilityProviderProps {
  children: React.ReactNode;
}

/**
 * Subscribes to the better-auth session and (re)builds a CASL `Ability`
 * whenever the user changes. Children read the ability via
 * `React.useContext(AbilityContext)` or via `<Can>` from
 * `@/shared/lib/casl` — both are wired inside the shared wrapper.
 */
export function AbilityProvider({ children }: AbilityProviderProps): React.ReactElement {
  const session = useSession();
  const user = session.data?.user as AbilityUser | undefined;

  const ability = React.useMemo(() => defineAbilityFor(user ?? null), [user]);

  return <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>;
}
