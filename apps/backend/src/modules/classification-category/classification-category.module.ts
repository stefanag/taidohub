import { Module } from '@nestjs/common';

import { ClassificationCategoryController } from './classification-category.controller.js';
import { ClassificationCategoryRepository } from './classification-category.repository.js';
import { ClassificationCategoryService } from './classification-category.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `ClassificationCategoryAbilityRules` is registered in `AbilityModule`
 * alongside the other rule contributors — re-declaring it here would create
 * a second instance with a different identity (see the feature-flags work
 * for the precedent).
 *
 * `ClassificationCategoryService` is exported so `TechniqueModule` can inject
 * it to validate `classificationIds` against the allowed-roots rule.
 */
@Module({
  controllers: [ClassificationCategoryController],
  providers: [ClassificationCategoryRepository, ClassificationCategoryService],
  exports: [ClassificationCategoryService],
})
export class ClassificationCategoryModule {}
