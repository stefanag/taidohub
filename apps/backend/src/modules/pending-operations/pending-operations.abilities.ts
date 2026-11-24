import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * PendingOperation CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Every authenticated user: `read`, `create` and `update` on pending
 *    operations they proposed (`createdByUserId` = their id). `update`
 *    covers approving and rejecting.
 *  - Nobody else may decide someone's proposal. Sysadmin's `manage all`
 *    also matches this subject, so `PendingOperationsService` additionally
 *    requires `createdByUserId === actor.id` for approve and reject: the
 *    agreed rule is "only the proposer decides".
 *
 * Who may *propose* is gated by MCP access (`use Mcp`), since proposals
 * only come from AI clients; whether the proposed write itself is allowed is
 * checked by the owning service at proposal and again at approval.
 */
@AbilityContributor()
@Injectable()
export class PendingOperationAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can(['read', 'create', 'update'], 'PendingOperation', { createdByUserId: user.id });
  }
}
