import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Sysadmin can manage all OrganisationMembership rows. An orgadmin can read
 * every membership row in any org they orgadmin, and create or delete
 * instructor-role rows in those orgs. Updates are sysadmin-only — orgadmins
 * who need a role swap delete + create.
 */
@AbilityContributor()
@Injectable()
export class MembershipsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'OrganisationMembership');
      return;
    }
    const orgs = user.memberships
      .filter((m) => m.role === 'orgadmin')
      .map((m) => m.organisationId);
    if (orgs.length === 0) return;

    builder.can('read', 'OrganisationMembership', { organisationId: { $in: orgs } } as never);
    builder.can('create', 'OrganisationMembership', {
      organisationId: { $in: orgs },
      role: 'instructor',
    } as never);
    builder.can('delete', 'OrganisationMembership', {
      organisationId: { $in: orgs },
      role: 'instructor',
    } as never);
    // No 'update' — intentional.
  }
}
