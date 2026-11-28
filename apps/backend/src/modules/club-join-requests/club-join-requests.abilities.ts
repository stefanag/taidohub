import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * ClubJoinRequest CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Every authenticated user: `create`, `read` and `delete` (cancel) their
 *    own requests (`userId` matches). Whether they may ask at all (no
 *    membership yet, no pending request) is checked in the service.
 *  - orgadmin and instructor of a club: `read` and `update` (approve or
 *    decline) requests to that club (`organisationId` matches). Only the
 *    club itself: an orgadmin of a parent federation does not decide.
 *  - sysadmin: `manage` on every request.
 */
@AbilityContributor()
@Injectable()
export class ClubJoinRequestAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'ClubJoinRequest');
      return;
    }
    builder.can(['create', 'read', 'delete'], 'ClubJoinRequest', { userId: user.id });
    for (const m of user.memberships) {
      if (m.role === 'orgadmin' || m.role === 'instructor') {
        builder.can(['read', 'update'], 'ClubJoinRequest', { organisationId: m.organisationId });
      }
    }
  }
}
