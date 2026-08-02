import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatisticsRepository } from './statistics.repository.js';

@Injectable()
export class StatisticsCronService {
  private readonly logger = new Logger(StatisticsCronService.name);

  constructor(private readonly repo: StatisticsRepository) {}

  @Cron('0 3 * * *') // 03:00 every day
  async runNightly(): Promise<void> {
    await this.repo.refreshActivityStats();
    await this.repo.recomputeAvgGapPerRank();
    await this.repo.captureMonthlyIfNewMonth();
    const { durationMs } = await this.repo.rebuildAll();
    // NB: Logger.log calls console under the hood; the test asserts on that.
    console.log(`[statistics] rebuild_all completed in ${durationMs}ms`);
  }
}
