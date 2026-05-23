import { Module } from '@nestjs/common';

import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

// UsersAbilityRules is provided by AbilityModule (which is @Global) so the
// rules are picked up by AbilityFactory there. This module only owns the
// HTTP/data layer for users.
@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
