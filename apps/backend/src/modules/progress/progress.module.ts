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
 * can depend on it directly. `ProgressRepository` is also exported because
 * `StudentsModule` (Phase 3.5 — instructor view) injects it directly to
 * hydrate a student's progress list without round-tripping through
 * `ProgressService` (which is self-scoped).
 */
@Module({
  controllers: [ProgressController],
  providers: [ProgressRepository, ProgressService],
  exports: [ProgressService, ProgressRepository],
})
export class ProgressModule {}
