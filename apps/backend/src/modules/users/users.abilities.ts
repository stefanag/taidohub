import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types';
import { type AbilityBuilder } from '@casl/ability';

/**
 * - Authenticated users may read their own user row.
 * - Users with `role === 'admin'` may manage all users.
 */
@Injectable()
export class UsersAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    if (user.role === 'admin') {
      builder.can('manage', 'User');
      return;
    }

    builder.can('read', 'User', { id: user.id });
  }
}
