import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * - `sysadmin` can manage every user.
 * - Anyone else can read their own row.
 */
@Injectable()
export class UsersAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('manage', 'User');
      return;
    }

    builder.can('read', 'User', { id: user.id });
  }
}
