import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';

import { ProfileController } from './profile.controller.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [UsersModule], // for UsersRepository (user-existence check)
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
  exports: [ProfileService],
})
export class ProfileModule {}
