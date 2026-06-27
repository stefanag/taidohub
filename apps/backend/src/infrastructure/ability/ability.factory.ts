import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { type AuthenticatedUser } from '../auth/auth.types.js';
import { UserContextService } from '../auth/user-context.service.js';

import { ABILITY_CONTRIBUTOR_METADATA } from './ability-contributor.decorator.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
  type AppSubjectName,
} from './ability.types.js';

/**
 * Builds CASL abilities from every `@AbilityContributor()`-decorated
 * provider in the application.
 *
 * Contributors are discovered once on bootstrap via Nest's
 * `DiscoveryService` rather than listed explicitly. Adding a new
 * module's rules is now a 1-decorator + 1-provider change — no edit
 * to this file. See `ability-contributor.decorator.ts` for the
 * contract.
 *
 * Each contributor's `contributeTo()` runs in DI provider order
 * (which is itself deterministic per module). The matrix is designed
 * so any order works: rules can only broaden — never shadow — what
 * earlier rules granted. That's why the order returned by
 * `DiscoveryService` doesn't appear in any spec assertion.
 */
@Injectable()
export class AbilityFactory implements OnModuleInit {
  private contributors: AbilityRuleContributor[] = [];

  constructor(
    private readonly userContext: UserContextService,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    this.contributors = this.discovery
      .getProviders()
      .filter((wrapper): wrapper is typeof wrapper & { instance: object } =>
        wrapper.instance !== null && typeof wrapper.instance === 'object',
      )
      .filter((wrapper) => {
        // `wrapper.metatype` is the constructor function; that's the
        // target the decorator's `SetMetadata` attached to. Reading
        // off the instance's prototype's constructor lands at the
        // same metatype for normal class providers, but using
        // `metatype` directly is more robust against factory/value
        // providers that happen to expose an object shaped like a
        // contributor.
        const metatype = wrapper.metatype ?? Object.getPrototypeOf(wrapper.instance).constructor;
        if (typeof metatype !== 'function') return false;
        return this.reflector.get(ABILITY_CONTRIBUTOR_METADATA, metatype) === true;
      })
      .map((wrapper) => wrapper.instance as AbilityRuleContributor)
      .filter(
        (instance): instance is AbilityRuleContributor =>
          typeof (instance as Partial<AbilityRuleContributor>).contributeTo === 'function',
      );
  }

  /**
   * Build a fresh `AppAbility` for the given user (or an anonymous one when
   * `user` is `null`). Each contributor runs in DI provider order;
   * later rules can broaden — never shadow — earlier ones.
   *
   * Kept public for callers that genuinely need an ability for some
   * user OTHER than the request actor (e.g. the AbilityGuard which
   * runs before the UserContext is fully populated, or admin-side
   * "simulate as user" tooling). Row-level write checks inside
   * services should use {@link forCurrentRequest} instead so the
   * ability is cached for the lifetime of the request.
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

  /**
   * Returns the ability for the actor of the current HTTP request,
   * caching it for the rest of the request lifecycle.
   *
   * Before this method existed, a request that touched two row-level
   * checks (e.g. update + delete on the same controller call chain)
   * built the ability twice — each rebuild iterating every rule
   * contributor and allocating a fresh CASL `Ability` object. Now
   * the second call is a Map lookup.
   *
   * Throws if called outside a request (no UserContext bound) — see
   * {@link UserContextService.getUser} for the rationale on loud
   * failure here.
   */
  forCurrentRequest(): AppAbility {
    const cached = this.userContext.getCachedAbility();
    if (cached !== null) return cached;
    const ability = this.createForUser(this.userContext.getUser());
    this.userContext.setCachedAbility(ability);
    return ability;
  }
}
