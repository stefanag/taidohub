import { forwardRef, Module } from '@nestjs/common';

import { LabelsModule } from '../labels/labels.module.js';

import { OrganisationsController } from './organisations.controller.js';
import { OrganisationsRepository } from './organisations.repository.js';
import { OrganisationsService } from './organisations.service.js';

@Module({
  imports: [forwardRef(() => LabelsModule)],
  controllers: [OrganisationsController],
  providers: [OrganisationsService, OrganisationsRepository],
  exports: [OrganisationsService, OrganisationsRepository],
})
export class OrganisationsModule {}
