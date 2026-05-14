import { Module } from '@nestjs/common';

import { PostsController } from './posts.controller.js';
import { PostsRepository } from './posts.repository.js';
import { PostsService } from './posts.service.js';

// PostsAbilityRules is provided by AbilityModule (which @Global) so the
// rules are picked up by AbilityFactory there. This module only owns the
// HTTP/data layer for posts.
@Module({
  controllers: [PostsController],
  providers: [PostsService, PostsRepository],
  exports: [PostsService],
})
export class PostsModule {}
