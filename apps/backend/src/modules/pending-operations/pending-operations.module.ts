import { Module } from '@nestjs/common';

import { BeltCatalogModule } from '../belt-catalog/belt-catalog.module.js';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
import { RankHistoryModule } from '../rank-history/rank-history.module.js';

import { PendingOperationsController } from './pending-operations.controller.js';
import { PendingOperationsRepository } from './pending-operations.repository.js';
import { PendingOperationsService } from './pending-operations.service.js';

/**
 * Proposals from AI clients and their approval.
 *
 * Imports are the modules whose exported services the approval path calls:
 * `RankHistoryModule` (the write itself and its permission check),
 * `BeltCatalogModule` (rank names for the preview) and `FeatureFlagsModule`
 * (grading history must be enabled). `DatabaseModule`, `AbilityModule` and
 * `AuditLogModule` are global. `PendingOperationAbilityRules` is provided in
 * `AbilityModule` with the other rule contributors.
 *
 * `PendingOperationsService` is exported for the MCP module's proposal tools.
 */
@Module({
  imports: [RankHistoryModule, BeltCatalogModule, FeatureFlagsModule],
  controllers: [PendingOperationsController],
  providers: [PendingOperationsRepository, PendingOperationsService],
  exports: [PendingOperationsService],
})
export class PendingOperationsModule {}
