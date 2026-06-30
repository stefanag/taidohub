import { Module } from '@nestjs/common';

import { OrganisationsModule } from '../organisations/organisations.module.js';

import { GradingRequirementsAbilityRules } from './grading-requirements.ability-rules.js';
import { RequirementSetsController } from './requirement-sets.controller.js';
import { RequirementSetsRepository } from './requirement-sets.repository.js';
import { RequirementSetsService } from './requirement-sets.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `OrganisationsModule` is imported because `RequirementSetsService` injects
 * `OrganisationsRepository` to resolve ancestor org IDs for list scoping.
 *
 * `GradingRequirementsAbilityRules` is registered alongside the other rule
 * contributors in `AbilityModule` — re-declaring it here would create a second
 * instance and the `@AbilityContributor()` decorator-based auto-discovery would
 * pick it up twice.
 *
 * `RequirementSetsService` is exported so future modules (rank-requirements,
 * grading sessions) can depend on it directly.
 */
@Module({
  imports: [OrganisationsModule],
  // TODO(Task 12-13): add RankRequirementsController once it exists.
  controllers: [RequirementSetsController],
  providers: [
    RequirementSetsRepository,
    RequirementSetsService,
    // TODO(Task 12-13): add RankRequirementsService + RankRequirementsRepository once they exist.
    GradingRequirementsAbilityRules,
  ],
  exports: [RequirementSetsService],
})
export class GradingRequirementsModule {}
