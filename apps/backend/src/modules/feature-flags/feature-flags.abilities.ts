import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Feature-flag CASL rules.
 *
 * - `sysadmin` can `manage` every `FeatureFlag` (read all rows + toggle).
 * - Everyone else — including authenticated users and the anonymous viewer —
 *   has no rule on `FeatureFlag`. The public `GET /api/feature-flags`
 *   endpoint returns the resolved map without going through CASL.
 */
@AbilityContributor()
@Injectable()
export class FeatureFlagsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'FeatureFlag');
    }
  }
}
