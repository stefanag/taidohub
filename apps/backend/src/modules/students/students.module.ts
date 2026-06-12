import { Module } from '@nestjs/common';

import { ProgressModule } from '../progress/progress.module.js';

import { StudentAbilityRules } from './students.ability-rules.js';
import { StudentsController } from './students.controller.js';
import { StudentsRepository } from './students.repository.js';
import { StudentsService } from './students.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `ProgressModule` is NOT global — we import it so DI can resolve
 * `ProgressService` (for on-behalf-of mutations) and `ProgressRepository`
 * (for the per-student progress list). Both are re-exported from
 * `ProgressModule`.
 *
 * `StudentAbilityRules` is registered alongside the other rule contributors
 * in `AbilityModule` (wired in Task 6). Declaring it here makes the class
 * resolvable for unit tests; production wiring is centralised.
 */
@Module({
  imports: [ProgressModule],
  controllers: [StudentsController],
  providers: [StudentsRepository, StudentsService, StudentAbilityRules],
  exports: [StudentsService, StudentAbilityRules],
})
export class StudentsModule {}
