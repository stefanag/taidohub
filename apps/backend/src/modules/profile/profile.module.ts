import { Module } from '@nestjs/common';

import { OrganisationsModule } from '../organisations/organisations.module.js';
import { UsersModule } from '../users/users.module.js';

import { ProfileController } from './profile.controller.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

@Module({
  // UsersRepository: user-existence check; OrganisationsService: the
  // reference federation must be a national federation.
  imports: [UsersModule, OrganisationsModule],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
  exports: [ProfileService],
})
export class ProfileModule {}
