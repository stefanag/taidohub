import { Module } from '@nestjs/common';

import { ABILITY_RULES } from '../../infrastructure/ability/ability.types';

import { UsersAbilityRules } from './users.abilities';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

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
