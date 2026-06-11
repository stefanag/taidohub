import { Module } from '@nestjs/common';

import { ProgressController } from './progress.controller.js';
import { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `ProgressAbilityRules` is registered alongside the other rule contributors
 * in `AbilityModule` — re-declaring it here would create a second instance.
 *
 * `ProgressService` is exported so future modules (study programs, dashboards)
 * can depend on it directly.
 */
@Module({
  controllers: [ProgressController],
  providers: [ProgressRepository, ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
