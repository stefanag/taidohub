import type { MongoAbility } from '@casl/ability';
import { createContextualCan } from '@casl/react';
import { createContext } from 'react';

import type { AppAbilityTuple } from '@repo/contracts/casl';

export type AppAbility = MongoAbility<AppAbilityTuple>;

/**
 * React context that carries the current user's CASL ability. Default value
 * is `null` — consumers should always be inside an `<AbilityContext.Provider>`
 * supplied by `app/providers/AbilityProvider.tsx`.
 */
export const AbilityContext = createContext<AppAbility | null>(null);

/**
 * `<Can>` component bound to our `AbilityContext`. Usage:
 *   <Can I="manage" a="Organisation">{() => <Button>New organisation</Button>}</Can>
 */
export const Can = createContextualCan(
  AbilityContext.Consumer as React.Consumer<AppAbility>,
);
