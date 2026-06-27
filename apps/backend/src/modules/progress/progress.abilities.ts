import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * Progress CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Every authenticated user gets conditional `manage` scoped to rows whose
 *    `userId` matches their own user id. The service additionally filters by
 *    `userId` at the SQL level — the CASL rule is belt-and-braces for
 *    instance-level checks (e.g. `findOne` / `delete` after a lookup).
 *  - `sysadmin` gets unconditional `manage` so admin tooling can audit any
 *    user's progress without going through impersonation.
 *
 * Note that `Progress` does not get a class-level `read` grant — the catalogue
 * is per-user data, not editorial content, so the `manage` rule is the only
 * grant the module emits.
 */
@AbilityContributor()
@Injectable()
export class ProgressAbilityRules implements AbilityRuleContributor {
  contributeTo(
    builder: AbilityBuilder<AppAbility>,
    user: AuthenticatedUser | null,
  ): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('manage', 'Progress');
      return;
    }

    builder.can('manage', 'Progress', { userId: user.id });
  }
}
