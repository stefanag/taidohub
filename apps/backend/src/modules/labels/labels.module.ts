import { Module } from '@nestjs/common';

import { OrganisationsModule } from '../organisations/organisations.module.js';

import { LabelsController } from './labels.controller.js';
import { LabelsRepository } from './labels.repository.js';
import { LabelsService } from './labels.service.js';

/**
 * `DatabaseModule` (Drizzle) and `AbilityModule` are both `@Global`, so they
 * don't need to be imported here. `LabelsAbilityRules` is registered in
 * `AbilityModule` alongside the other rule contributors — re-declaring it
 * here would create a second instance with a different identity.
 *
 * `OrganisationsModule` is imported for `OrganisationsRepository`, which the
 * controller uses to resolve the target organisation row before running the
 * CASL `manage`/`read` check on the attach/list-attachments endpoints.
 *
 * `LabelsService` is exported so Phase B integrating modules (organisations,
 * users, rank-history) can inject it to call `filterTargetsByLabels` and the
 * `detachAllForTarget` cascade hook.
 */
@Module({
  imports: [OrganisationsModule],
  controllers: [LabelsController],
  providers: [LabelsService, LabelsRepository],
  exports: [LabelsService],
})
export class LabelsModule {}
