import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Organisation rules: only `role === 'admin'` can do anything. v1 surfaces
 * no public/anonymous read; relax later if non-admins need the tree.
 */
@Injectable()
export class OrganisationsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (user?.role === 'admin') {
      builder.can('manage', 'Organisation');
    }
  }
}
