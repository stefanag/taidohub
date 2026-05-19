import { Module } from '@nestjs/common';

import { OrganisationsController } from './organisations.controller.js';
import { OrganisationsRepository } from './organisations.repository.js';
import { OrganisationsService } from './organisations.service.js';

@Module({
  controllers: [OrganisationsController],
  providers: [OrganisationsService, OrganisationsRepository],
  exports: [OrganisationsService, OrganisationsRepository],
})
export class OrganisationsModule {}
