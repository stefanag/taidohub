import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { AbilityContributor } from '../../infrastructure/ability/ability-contributor.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * RankHistory rules — class-level only; per-row checks live in
 * `RankHistoryAuthService` (cross-join predicates can't be expressed in CASL
 * conditions). Every authenticated user gets the class-level rules; the
 * service-layer predicates then narrow per row and per subject.
 */
@AbilityContributor()
@Injectable()
export class RankHistoryAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'RankHistory');
    builder.can('create', 'RankHistory');
    builder.can('update', 'RankHistory');
    builder.can('delete', 'RankHistory');
  }
}
