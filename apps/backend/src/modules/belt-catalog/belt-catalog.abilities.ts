import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Belt catalog ability rules.
 *
 * - Any authenticated user can read BeltSystem, BeltRank, and ShogoTitle.
 * - `sysadmin` can manage all three subjects. The backend ability factory
 *   has no global `manage all` wildcard — each module grants its own
 *   sysadmin rules (mirrors `OrganisationsAbilityRules`).
 */
@Injectable()
export class BeltCatalogAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    builder.can('read', 'BeltSystem');
    builder.can('read', 'BeltRank');
    builder.can('read', 'ShogoTitle');

    if (user.role === 'sysadmin') {
      builder.can('manage', 'BeltSystem');
      builder.can('manage', 'BeltRank');
      builder.can('manage', 'ShogoTitle');
    }
  }
}
