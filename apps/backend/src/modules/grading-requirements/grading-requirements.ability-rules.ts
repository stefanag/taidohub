import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * RequirementSet CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Every authenticated user can `read` RequirementSet.
 *  - `sysadmin` can `manage` (= create/read/update/delete/activate) any set.
 *  - `orgadmin` and `instructor` users get `manage` scoped to sets whose
 *    `organisationId` matches one of their memberships.
 */
@AbilityContributor()
@Injectable()
export class GradingRequirementsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    builder.can('read', 'RequirementSet');

    if (user.role === 'sysadmin') {
      builder.can('manage', 'RequirementSet');
      return;
    }

    const orgIds = user.memberships
      .filter((m) => m.role === 'orgadmin' || m.role === 'instructor')
      .map((m) => m.organisationId);

    for (const id of orgIds) {
      builder.can('manage', 'RequirementSet', { organisationId: id });
    }
  }
}
