import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { BeltCatalogAbilityRules } from '../../modules/belt-catalog/belt-catalog.abilities.js';
import { RankHistoryAbilityRules } from '../../modules/rank-history/rank-history.abilities.js';
import { AuditLogAbilityRules } from '../../modules/audit-log/audit-log.abilities.js';
import { ClassificationCategoryAbilityRules } from '../../modules/classification-category/classification-category.abilities.js';
import { FeatureFlagsAbilityRules } from '../../modules/feature-flags/feature-flags.abilities.js';
import { FeedbackAbilityRules } from '../../modules/feedback/feedback.abilities.js';
import { LabelsAbilityRules } from '../../modules/labels/labels.abilities.js';
import { MembershipsAbilityRules } from '../../modules/memberships/memberships.abilities.js';
import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
import { PatternAbilityRules } from '../../modules/pattern/pattern.abilities.js';
import { ProgressAbilityRules } from '../../modules/progress/progress.abilities.js';
import { StudentAbilityRules } from '../../modules/students/students.abilities.js';
import { TechniqueAbilityRules } from '../../modules/technique/technique.abilities.js';
import { UsersAbilityRules } from '../../modules/users/users.abilities.js';

import { AbilityFactory } from './ability.factory.js';
import { AbilityGuard } from './ability.guard.js';

/**
 * Global ability module.
 *
 * Rule contributors are registered as providers here so `AbilityFactory`
 * can inject them directly. The previous design tried to multi-bind them
 * under the `ABILITY_RULES` token from each feature module — but NestJS
 * doesn't aggregate multiple providers under a single token (that pattern
 * is Angular-specific). Centralising registration here is the simplest
 * approach that actually wires them up.
 *
 * The `AbilityGuard` runs after `AuthGuard` (Nest invokes guards in
 * registration order).
 */
@Global()
@Module({
  providers: [
    BeltCatalogAbilityRules,
    RankHistoryAbilityRules,
    AuditLogAbilityRules,
    ClassificationCategoryAbilityRules,
    FeatureFlagsAbilityRules,
    FeedbackAbilityRules,
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
