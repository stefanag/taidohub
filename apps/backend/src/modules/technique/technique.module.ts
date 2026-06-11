import { Module } from '@nestjs/common';

import { ClassificationCategoryModule } from '../classification-category/classification-category.module.js';

import { TechniqueController } from './technique.controller.js';
import { TechniqueRepository } from './technique.repository.js';
import { TechniqueService } from './technique.service.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `ClassificationCategoryModule` is imported because `TechniqueService` injects
 * the classification-category service AND repository to validate links and to
 * hydrate the API response.
 *
 * `TechniqueAbilityRules` is registered alongside the other rule contributors
 * in `AbilityModule` — re-declaring it here would create a second instance.
 *
 * `TechniqueService` is exported so future modules (catalogue, study programs)
 * can depend on it directly.
 */
@Module({
  imports: [ClassificationCategoryModule],
  controllers: [TechniqueController],
  providers: [TechniqueRepository, TechniqueService],
  exports: [TechniqueService],
})
export class TechniqueModule {}
