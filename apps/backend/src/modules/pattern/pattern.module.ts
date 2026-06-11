import { Module } from '@nestjs/common';

import { ClassificationCategoryModule } from '../classification-category/classification-category.module.js';

import { PatternController } from './pattern.controller.js';
import { PatternRepository } from './pattern.repository.js';
import { PatternService } from './pattern.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `ClassificationCategoryModule` is imported because `PatternService` injects
 * the classification-category service AND repository to validate links and to
 * hydrate the API response.
 *
 * `PatternAbilityRules` is registered alongside the other rule contributors
 * in `AbilityModule` — re-declaring it here would create a second instance.
 *
 * `PatternService` is exported so future modules (catalogue, study programs)
 * can depend on it directly.
 */
@Module({
  imports: [ClassificationCategoryModule],
  controllers: [PatternController],
  providers: [PatternRepository, PatternService],
  exports: [PatternService],
})
export class PatternModule {}
