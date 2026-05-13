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
    { provide: ABILITY_RULES, useExisting: PostsAbilityRules, multi: true },
  ],
  exports: [PostsService],
})
export class PostsModule {}
