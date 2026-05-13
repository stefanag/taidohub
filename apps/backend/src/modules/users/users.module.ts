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
    // `multi: true` is an Angular-style multi-binding hint; NestJS's Provider
    // type doesn't declare it but ABILITY_RULES is wired up to expect an
    // array of contributors. Suppress the type-only error.
    // @ts-expect-error multi-binding intent preserved
    { provide: ABILITY_RULES, useExisting: UsersAbilityRules, multi: true },
  ],
  exports: [UsersService],
})
export class UsersModule {}
