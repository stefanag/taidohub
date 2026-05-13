import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { type AuthenticatedUser } from '../auth/auth.types.js';

import {
  ABILITY_RULES,
  type AbilityRuleContributor,
  type AppAbility,
  type AppSubjectName,
} from './ability.types.js';

@Injectable()
export class AbilityFactory {
  constructor(
    @Optional()
    @Inject(ABILITY_RULES)
    private readonly contributors: AbilityRuleContributor[] = [],
  ) {}

  /**
   * Build a fresh `AppAbility` for the given user (or an anonymous one when
   * `user` is `null`). Each module's rule contributor runs in registration
   * order; later rules can broaden — never shadow — earlier ones.
   */
  createForUser(user: AuthenticatedUser | null): AppAbility {
    const builder = new AbilityBuilder<AppAbility>(createMongoAbility);

    for (const contributor of this.contributors) {
      contributor.contributeTo(builder, user);
    }

    return builder.build({
      detectSubjectType: (subject) =>
        ((subject as { __caslSubjectType__?: string }).__caslSubjectType__ ??
          (subject.constructor as { name: string }).name) as AppSubjectName,
    });
  }
}
