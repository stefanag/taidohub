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
 * - Sysadmin's `('manage', 'all')` rule already covers management of these subjects.
 */
@Injectable()
export class BeltCatalogAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    builder.can('read', 'BeltSystem');
    builder.can('read', 'BeltRank');
    builder.can('read', 'ShogoTitle');
  }
}
