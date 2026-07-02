import { Global, Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';

import { AuditLogAbilityRules } from '../../modules/audit-log/audit-log.abilities.js';
import { BeltCatalogAbilityRules } from '../../modules/belt-catalog/belt-catalog.abilities.js';
import { ClassificationCategoryAbilityRules } from '../../modules/classification-category/classification-category.abilities.js';
import { FeatureFlagsAbilityRules } from '../../modules/feature-flags/feature-flags.abilities.js';
import { FeedbackAbilityRules } from '../../modules/feedback/feedback.abilities.js';
import { GradingRequirementsAbilityRules } from '../../modules/grading-requirements/grading-requirements.ability-rules.js';
import { LabelsAbilityRules } from '../../modules/labels/labels.abilities.js';
import { MembershipsAbilityRules } from '../../modules/memberships/memberships.abilities.js';
import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
import { PatternAbilityRules } from '../../modules/pattern/pattern.abilities.js';
import { ProgressAbilityRules } from '../../modules/progress/progress.abilities.js';
import { RankHistoryAbilityRules } from '../../modules/rank-history/rank-history.abilities.js';
import { StudentAbilityRules } from '../../modules/students/students.abilities.js';
import { TechniqueAbilityRules } from '../../modules/technique/technique.abilities.js';
import { UsersAbilityRules } from '../../modules/users/users.abilities.js';

import { AbilityFactory } from './ability.factory.js';
import { AbilityGuard } from './ability.guard.js';

/**
 * Global ability module.
 *
 * `DiscoveryModule` from `@nestjs/core` exposes `DiscoveryService`,
 * which `AbilityFactory` uses on bootstrap to find every provider
 * decorated with `@AbilityContributor()`. Before this redesign the
 * factory took 14 `@Optional()` constructor parameters — one per
 * contributor — and every new ability rule meant edits in two
 * places (the factory's constructor AND this module's providers
 * list). The decorator + auto-discovery collapses that to a single
 * decorator on the contributor class plus one provider entry here.
 *
 * The 14 contributors below are still listed as providers so the
 * Nest container instantiates them. They're not injected into
 * `AbilityFactory` directly anymore.
 *
 * The `AbilityGuard` runs after `AuthGuard` (Nest invokes guards in
 * registration order).
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    BeltCatalogAbilityRules,
    RankHistoryAbilityRules,
    AuditLogAbilityRules,
    ClassificationCategoryAbilityRules,
    FeatureFlagsAbilityRules,
    FeedbackAbilityRules,
    GradingRequirementsAbilityRules,
    LabelsAbilityRules,
    MembershipsAbilityRules,
    OrganisationsAbilityRules,
    PatternAbilityRules,
    ProgressAbilityRules,
    StudentAbilityRules,
    TechniqueAbilityRules,
    UsersAbilityRules,
    AbilityFactory,
    AbilityGuard,
    { provide: APP_GUARD, useClass: AbilityGuard },
  ],
  exports: [AbilityFactory, AbilityGuard],
})
export class AbilityModule {}
