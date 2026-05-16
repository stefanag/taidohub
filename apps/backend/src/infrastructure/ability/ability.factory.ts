import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../auth/auth.types.js';

import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
import { PostsAbilityRules } from '../../modules/posts/posts.abilities.js';
import { UsersAbilityRules } from '../../modules/users/users.abilities.js';

import {
  type AbilityRuleContributor,
  type AppAbility,
  type AppSubjectName,
} from './ability.types.js';

@Injectable()
export class AbilityFactory {
  /**
   * Contributors are listed explicitly here rather than discovered via a
   * `multi: true` provider token — NestJS's DI does not aggregate multiple
   * providers under one token (that's an Angular concept). Each new feature
   * module that wants to contribute rules must be added below.
   */
  private readonly contributors: AbilityRuleContributor[];

  constructor(
    postsRules: PostsAbilityRules,
    usersRules: UsersAbilityRules,
    organisationsRules: OrganisationsAbilityRules,
  ) {
    this.contributors = [postsRules, usersRules, organisationsRules];
  }

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
