import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Classification-category CASL rules.
 *
 * - Anonymous callers get nothing — the global `AuthGuard` already rejects
 *   them with 401 before CASL sees the request, but we don't grant `read`
 *   here either as belt-and-braces.
 * - Every authenticated user (any role) can `read` `ClassificationCategory`.
 *   The taxonomy is editorial reference data that the SPA needs to render
 *   pickers and labels regardless of org membership.
 * - `sysadmin` additionally can `manage` (= read/update/anything) — the
 *   only mutation today is `PATCH /:id` from the admin UI.
 */
@AbilityContributor()
@Injectable()
export class ClassificationCategoryAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'ClassificationCategory');
    if (user.role === 'sysadmin') {
      builder.can('manage', 'ClassificationCategory');
    }
  }
}
