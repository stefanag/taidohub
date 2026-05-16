import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import type { User } from '@repo/contracts/users';

import type { AppAbility } from './ability-context.js';

/**
 * Optional shape of the user object handed to `defineAbilityFor`. We accept
 * `null`/`undefined` for the anonymous case and an optional `role` field
 * to express admin privileges (the contract `User` schema does not currently
 * carry a role; this is a deliberate forward-compatible hook).
 */
export interface AbilityUser extends Pick<User, 'id'> {
  role?: 'admin' | 'user';
}

/**
 * Build the CASL `Ability` instance for the current user.
 *
 *   anonymous → no permissions.
 *   user      → no domain permissions (yet).
 *   admin     → `manage all`.
 *
 * Mirrors (and should stay in lock-step with) the backend's
 * `infrastructure/ability/ability.factory.ts` so a UI gate and an API guard
 * never disagree.
 */
export function defineAbilityFor(user: AbilityUser | null | undefined): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (user?.role === 'admin') {
    can('manage', 'all');
  }

  return build();
}
