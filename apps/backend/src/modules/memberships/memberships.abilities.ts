import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Membership rules: only sysadmin can manage `OrganisationMembership`. Other
 * users get read on their own memberships via the `User` subject already
 * (their session carries the membership list).
 */
@Injectable()
export class MembershipsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (user?.role === 'sysadmin') {
      builder.can('manage', 'OrganisationMembership');
    }
  }
}
