import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Technique CASL rules.
 *
 *  - Anonymous: nothing (the global `AuthGuard` rejects before CASL sees it,
 *    but we don't grant `read` here either as belt-and-braces).
 *  - Every authenticated user can `read` Technique — the catalogue is editorial
 *    reference data the SPA needs in pickers and tables.
 *  - `sysadmin` can `manage` (= create/read/update/delete) every technique.
 *  - `orgadmin` users get:
 *      - unconditional `create` (the service stamps `createdByOrganisationId`
 *        based on their membership / explicit `organisationId`).
 *      - conditional `manage` scoped to techniques whose
 *        `createdByOrganisationId` is in the set of orgs they administer.
 *        Globals (`null`) and other-org techniques are NOT managed.
 *
 * Read-only (plain) users / instructors can only read.
 */
@AbilityContributor()
@Injectable()
export class TechniqueAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;

    builder.can('read', 'Technique');

    if (user.role === 'sysadmin') {
      builder.can('manage', 'Technique');
      return;
    }

    const orgAdminOrgs = user.memberships
      .filter((m) => m.role === 'orgadmin')
      .map((m) => m.organisationId);
    if (orgAdminOrgs.length > 0) {
      builder.can('manage', 'Technique', {
        createdByOrganisationId: { $in: orgAdminOrgs },
      });
      builder.can('create', 'Technique');
    }
  }
}
