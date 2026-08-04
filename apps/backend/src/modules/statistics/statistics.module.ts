import { Module } from '@nestjs/common';

import { BeltCatalogModule } from '../belt-catalog/belt-catalog.module.js';
import { MembershipsModule } from '../memberships/memberships.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { UsersModule } from '../users/users.module.js';

import { StatisticsAdminController, StatisticsController } from './statistics.controller.js';
import { StatisticsCronService } from './statistics.cron.js';
import { StatisticsRepository } from './statistics.repository.js';
import { StatisticsService } from './statistics.service.js';

/**
 * `DatabaseModule` and `AbilityModule` are `@Global` (see the identical note
 * in `feature-flags.module.ts`), so they aren't imported here.
 * `OrganisationsModule`, `BeltCatalogModule`, `UsersModule`, and
 * `MembershipsModule` export the four repositories/services
 * `StatisticsService` injects beyond `StatisticsRepository`/`AbilityFactory`
 * (`OrganisationsRepository`, `BeltRanksService`, `UsersRepository`,
 * `MembershipsRepository` — see `statistics.service.ts`'s constructor and
 * the Task 4 report's "Deviations" §3 for why the latter two were added
 * beyond the plan's original four-collaborator skeleton).
 *
 * `StatisticsAbilityRules` is registered directly in `AbilityModule`
 * alongside every other CASL rule contributor (same pattern as
 * `FeatureFlagsAbilityRules`), not here.
 *
 * Deviation from the plan doc (Task 7 "Module wiring"): the plan schedules
 * `StatisticsModule` creation for Task 7, once `StatisticsCronService`
 * (Task 6) exists, and expects `providers` to include it. This module is
 * created early, in Task 5, purely so the endpoint e2e spec
 * (`statistics-endpoints.e2e.spec.ts`) can boot the real `AppModule` and
 * exercise `StatisticsController`/`StatisticsAdminController` over HTTP —
 * the brief for Task 5 explicitly requires that e2e, and it cannot pass
 * without the controllers being reachable through some module.
 *
 * Task 6 adds `StatisticsCronService` to `providers` below. The `@Cron`
 * decorator on `runNightly()` is inert until `ScheduleModule.forRoot()` is
 * imported into `AppModule` — that wiring is deliberately left for Task 7,
 * so the cron job does not fire yet even though the provider is registered
 * and testable here.
 */
@Module({
  imports: [OrganisationsModule, BeltCatalogModule, UsersModule, MembershipsModule],
  controllers: [StatisticsController, StatisticsAdminController],
  providers: [StatisticsRepository, StatisticsService, StatisticsCronService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
