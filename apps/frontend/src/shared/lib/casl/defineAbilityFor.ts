import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import type { Role, User } from '@repo/contracts/users';

import type { AppAbility } from './ability-context.js';

/**
 * Shape of the user object handed to `defineAbilityFor`. `null`/`undefined`
 * is the anonymous case; `role` is the global role carried on the better-auth
 * session user.
 */
export interface AbilityUser extends Pick<User, 'id'> {
  role?: Role;
}

/**
 * Build the CASL `Ability` instance for the current user.
 *
 *   anonymous → no permissions.
 *   user      → no domain permissions.
 *   sysadmin  → `manage all`.
 *
 * Mirrors the backend's `infrastructure/ability/ability.factory.ts` for the
 * global role so a UI gate and an API guard never disagree. Org-scoped roles
 * (orgadmin / instructor) are not modelled here — the better-auth session
 * does not carry memberships.
 */
export function defineAbilityFor(user: AbilityUser | null | undefined): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (user?.role === 'sysadmin') {
    can('manage', 'all');
  }

  return build();
}
