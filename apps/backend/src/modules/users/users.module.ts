import { Module } from '@nestjs/common';

import { ABILITY_RULES } from '../../infrastructure/ability/ability.types.js';

import { UsersAbilityRules } from './users.abilities.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    UsersAbilityRules,
    { provide: ABILITY_RULES, useExisting: UsersAbilityRules, multi: true },
  ],
  exports: [UsersService],
})
export class UsersModule {}
