import { Module } from '@nestjs/common';

import { ABILITY_RULES } from '../../infrastructure/ability/ability.types.js';

import { PostsAbilityRules } from './posts.abilities.js';
import { PostsController } from './posts.controller.js';
import { PostsRepository } from './posts.repository.js';
import { PostsService } from './posts.service.js';

@Module({
  controllers: [PostsController],
  providers: [
    PostsService,
    PostsRepository,
    PostsAbilityRules,
    // `multi: true` is an Angular-style multi-binding hint; NestJS's Provider
    // type doesn't declare it but ABILITY_RULES is wired up to expect an
    // array of contributors. Suppress the type-only error.
    // @ts-expect-error multi-binding intent preserved
    { provide: ABILITY_RULES, useExisting: PostsAbilityRules, multi: true },
  ],
  exports: [PostsService],
})
export class PostsModule {}
