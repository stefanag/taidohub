import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatisticsRepository } from './statistics.repository.js';

@Injectable()
export class StatisticsCronService {
  constructor(private readonly repo: StatisticsRepository) {}

  @Cron('0 3 * * *') // 03:00 every day
  async runNightly(): Promise<void> {
    // rebuildAll() runs FIRST: it opens with TRUNCATE stat_current and only
    // re-populates real-time metrics. Running it after the activity/gap
    // steps would wipe the nightly-computed activity metrics, so those must
    // be layered on top of the rebuilt table, not before it.
    const { durationMs } = await this.repo.rebuildAll();
    await this.repo.refreshActivityStats();
    await this.repo.recomputeAvgGapPerRank();
    await this.repo.captureMonthlyIfNewMonth();
    // NB: Logger.log calls console under the hood; the test asserts on that.
    console.log(`[statistics] rebuild_all completed in ${durationMs}ms`);
  }
}
