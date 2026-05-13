import { Module } from '@nestjs/common';

import { ABILITY_RULES } from '../../infrastructure/ability/ability.types';

import { PostsAbilityRules } from './posts.abilities';
import { PostsController } from './posts.controller';
import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';

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
