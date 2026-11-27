import { Module } from '@nestjs/common';

import { BeltCatalogModule } from '../belt-catalog/belt-catalog.module.js';
import { ProgressModule } from '../progress/progress.module.js';

import { TrainingLogAbilityRules } from './training-log.abilities.js';
import { TrainingLogController } from './training-log.controller.js';
import { TrainingLogRepository } from './training-log.repository.js';
import { TrainingLogService } from './training-log.service.js';

/**
 * Training log and personal goals (self-registration plan, phase 2).
 *
 * Imports: ProgressModule for ProgressService.markPracticed (a session moves
 * "last practised" up), BeltCatalogModule for BeltRanksService (validating a
 * goal's target rank). DatabaseModule, AbilityModule and the feature-flag
 * guard are global. Nothing is exported: no other module reads a training log.
 */
@Module({
  imports: [ProgressModule, BeltCatalogModule],
  controllers: [TrainingLogController],
  providers: [TrainingLogRepository, TrainingLogService, TrainingLogAbilityRules],
})
export class TrainingLogModule {}
