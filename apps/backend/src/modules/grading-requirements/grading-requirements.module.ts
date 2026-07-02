import { Module } from '@nestjs/common';

import { OrganisationsModule } from '../organisations/organisations.module.js';
import { MembershipsModule } from '../memberships/memberships.module.js';

import { GradingRequirementsAbilityRules } from './grading-requirements.ability-rules.js';
import { RankRequirementsController } from './rank-requirements.controller.js';
import { RankRequirementsRepository } from './rank-requirements.repository.js';
import { RankRequirementsService } from './rank-requirements.service.js';
import { RequirementSetsController } from './requirement-sets.controller.js';
import { RequirementSetsRepository } from './requirement-sets.repository.js';
import { RequirementSetsService } from './requirement-sets.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `OrganisationsModule` is imported because `RequirementSetsService` injects
 * `OrganisationsRepository` to resolve ancestor org IDs for list scoping.
 * `MembershipsModule` is imported because `RankRequirementsService` injects
 * `MembershipsRepository` for the resolveForUser ancestor-walk.
 *
 * `GradingRequirementsAbilityRules` is registered alongside the other rule
 * contributors in `AbilityModule` — re-declaring it here would create a second
 * instance and the `@AbilityContributor()` decorator-based auto-discovery would
 * pick it up twice.
 *
 * `RequirementSetsService` and `RankRequirementsService` are exported so future
 * modules (grading sessions, etc.) can depend on them directly.
 * `RequirementSetsRepository` and `RankRequirementsRepository` are NOT
 * exported — neither has any auth checks of its own (only the services do),
 * so exporting either would let an importing module bypass CASL by injecting
 * the repository directly. `BeltCatalogModule`'s `BeltRanksService` needs an
 * unauthenticated "is there an active set for this org" lookup for the
 * public-rank projection (no `AuthenticatedUser` to hand to the gated
 * methods); that's exposed as `RequirementSetsService.findActiveByOrg` and
 * `RankRequirementsService.resolveForSetOrNull` instead of reaching for the
 * repositories.
 *
 * `RankRequirementsController` is registered alongside `RequirementSetsController`.
 */
@Module({
  imports: [OrganisationsModule, MembershipsModule],
  controllers: [RequirementSetsController, RankRequirementsController],
  providers: [
    RequirementSetsRepository,
    RequirementSetsService,
    RankRequirementsRepository,
    RankRequirementsService,
    GradingRequirementsAbilityRules,
  ],
  exports: [RequirementSetsService, RankRequirementsService],
})
export class GradingRequirementsModule {}
