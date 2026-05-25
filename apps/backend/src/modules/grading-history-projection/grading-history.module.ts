import { Module } from '@nestjs/common';

import { RankHistoryModule } from '../rank-history/rank-history.module.js';

import { GradingHistoryController } from './grading-history.controller.js';
import { GradingHistoryService } from './grading-history.service.js';

/**
 * Unified projection module — bridges the rank-history layer and the
 * frontend's "grading-history page" API. Depends on `RankHistoryModule` for
 * the repository + auth service (both exported there).
 */
@Module({
  imports: [RankHistoryModule],
  controllers: [GradingHistoryController],
  providers: [GradingHistoryService],
})
export class GradingHistoryProjectionModule {}
