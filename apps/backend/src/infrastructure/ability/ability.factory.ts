import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Injectable, Optional } from '@nestjs/common';

import { type AuthenticatedUser } from '../auth/auth.types.js';
import { UserContextService } from '../auth/user-context.service.js';

import { AuditLogAbilityRules } from '../../modules/audit-log/audit-log.abilities.js';
import { BeltCatalogAbilityRules } from '../../modules/belt-catalog/belt-catalog.abilities.js';
import { ClassificationCategoryAbilityRules } from '../../modules/classification-category/classification-category.abilities.js';
import { FeatureFlagsAbilityRules } from '../../modules/feature-flags/feature-flags.abilities.js';
import { FeedbackAbilityRules } from '../../modules/feedback/feedback.abilities.js';
import { LabelsAbilityRules } from '../../modules/labels/labels.abilities.js';
import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
import { PatternAbilityRules } from '../../modules/pattern/pattern.abilities.js';
import { ProgressAbilityRules } from '../../modules/progress/progress.abilities.js';
import { StudentAbilityRules } from '../../modules/students/students.abilities.js';
import { TechniqueAbilityRules } from '../../modules/technique/technique.abilities.js';
import { UsersAbilityRules } from '../../modules/users/users.abilities.js';
import { MembershipsAbilityRules } from '../../modules/memberships/memberships.abilities.js';
import { RankHistoryAbilityRules } from '../../modules/rank-history/rank-history.abilities.js';

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
    private readonly userContext: UserContextService,
    usersRules: UsersAbilityRules,
    organisationsRules: OrganisationsAbilityRules,
    auditLogRules: AuditLogAbilityRules,
    @Optional() membershipsRules?: MembershipsAbilityRules,
    @Optional() beltCatalogRules?: BeltCatalogAbilityRules,
    @Optional() rankHistoryRules?: RankHistoryAbilityRules,
    @Optional() labelsRules?: LabelsAbilityRules,
    @Optional() featureFlagsRules?: FeatureFlagsAbilityRules,
    @Optional() classificationCategoryRules?: ClassificationCategoryAbilityRules,
    @Optional() techniqueRules?: TechniqueAbilityRules,
    @Optional() private readonly patternRules?: PatternAbilityRules,
    @Optional() private readonly progressRules?: ProgressAbilityRules,
    @Optional() private readonly studentRules?: StudentAbilityRules,
    @Optional() private readonly feedbackRules?: FeedbackAbilityRules,
  ) {
    this.contributors = [
      usersRules,
      organisationsRules,
      auditLogRules,
      ...(membershipsRules ? [membershipsRules] : []),
      ...(beltCatalogRules ? [beltCatalogRules] : []),
      ...(rankHistoryRules ? [rankHistoryRules] : []),
      ...(labelsRules ? [labelsRules] : []),
      ...(featureFlagsRules ? [featureFlagsRules] : []),
      ...(classificationCategoryRules ? [classificationCategoryRules] : []),
      ...(techniqueRules ? [techniqueRules] : []),
      ...(this.patternRules ? [this.patternRules] : []),
      ...(this.progressRules ? [this.progressRules] : []),
      ...(this.studentRules ? [this.studentRules] : []),
      ...(this.feedbackRules ? [this.feedbackRules] : []),
    ];
  }

  /**
   * Build a fresh `AppAbility` for the given user (or an anonymous one when
   * `user` is `null`). Each module's rule contributor runs in registration
   * order; later rules can broaden — never shadow — earlier ones.
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
   * built the ability twice — each rebuild iterating 14 rule
   * contributors and allocating a fresh CASL `Ability` object. Now
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
