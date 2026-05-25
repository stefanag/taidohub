import { Module } from '@nestjs/common';

import { OrganisationsModule } from '../organisations/organisations.module.js';

import { MembershipsController } from './memberships.controller.js';
import { MembershipsRepository } from './memberships.repository.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [OrganisationsModule], // for OrganisationsRepository
  controllers: [MembershipsController],
  providers: [MembershipsService, MembershipsRepository],
  exports: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}
