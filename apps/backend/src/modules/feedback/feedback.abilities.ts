import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Feedback CASL rules.
 *
 * The fine-grained access matrix (subject / sysadmin / club admin /
 * linked instructor / grading examiner) is too cross-table to encode as
 * CASL conditions cleanly, so the actual decision lives in
 * `FeedbackService.canAccessThread()`. CASL here only grants the broad
 * "any authenticated user may interact with the feedback feature".
 * Combined with the per-route feature-flag guard, that's enough — the
 * service throws 403 with the spec's `FORBIDDEN` code when the
 * per-thread check fails.
 */
@AbilityContributor()
@Injectable()
export class FeedbackAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'FeedbackThread');
    builder.can('create', 'FeedbackThread');
    builder.can('update', 'FeedbackThread');
    builder.can('delete', 'FeedbackThread');
  }
}
