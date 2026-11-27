import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/**
 * TrainingSession CASL rules.
 *
 *  - Anonymous: nothing.
 *  - Every authenticated user: `manage` on their own sessions (`userId`
 *    matches). A training log is private, so not even sysadmin gets a broader
 *    grant; there is no admin tooling that reads someone else's log.
 *
 * The service filters by `userId` in SQL as well; this rule is the
 * instance-level check after a lookup by id (update, delete).
 */
@AbilityContributor()
@Injectable()
export class TrainingLogAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('manage', 'TrainingSession', { userId: user.id });
  }
}
