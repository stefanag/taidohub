import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types';

/**
 * Post rules:
 * - anyone (including anonymous) can read published posts;
 * - authenticated users can create posts;
 * - authors can read/update/delete their own posts (regardless of published flag);
 * - admins can manage everything.
 */
@Injectable()
export class PostsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    builder.can('read', 'Post', { published: true });

    if (!user) return;

    if (user.role === 'admin') {
      builder.can('manage', 'Post');
      return;
    }

    builder.can('create', 'Post');
    builder.can('read', 'Post', { authorId: user.id });
    builder.can('update', 'Post', { authorId: user.id });
    builder.can('delete', 'Post', { authorId: user.id });
  }
}
