import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * LegalDocument CASL rules (terms of use and privacy notices).
 *
 *  - Anonymous: nothing here. Published texts are read through the public
 *    `/legal/*` endpoints, which need no ability.
 *  - `sysadmin`: `manage` every document, the platform's own
 *    (`organisationId` null) included.
 *  - `orgadmin`: `manage` the documents of the organisations they administer.
 *    Not instructors: the texts are the organisation's legal commitments.
 *  - Everyone else: nothing.
 */
@AbilityContributor()
@Injectable()
export class LegalDocumentsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'LegalDocument');
      return;
    }
    for (const m of user.memberships.filter((x) => x.role === 'orgadmin')) {
      builder.can('manage', 'LegalDocument', { organisationId: m.organisationId });
    }
  }
}
