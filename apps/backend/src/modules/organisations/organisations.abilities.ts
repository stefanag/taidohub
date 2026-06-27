import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Organisation rules:
 * - `sysadmin` can manage everything.
 * - Each `orgadmin` membership grants `manage` scoped to that one
 *   organisation's id. Flat — no inheritance to children.
 * - Each `instructor` membership grants `read` on the one club it
 *   binds to.
 */
@AbilityContributor()
@Injectable()
export class OrganisationsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    if (user.role === 'sysadmin') {
      builder.can('manage', 'Organisation');
      return;
    }

    for (const m of user.memberships) {
      if (m.role === 'orgadmin') {
        builder.can('manage', 'Organisation', { id: m.organisationId });
      } else if (m.role === 'instructor') {
        builder.can('read', 'Organisation', { id: m.organisationId });
      }
    }
  }
}
