import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  type ListPostsResponse,
  type Post as PostT,
} from '@repo/contracts/posts';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { Public } from '../../infrastructure/auth/public.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { ListPostsResponseDto } from './dto/list-posts-response.dto.js';
import { PostDto } from './dto/post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@ApiCookieAuth('session')
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Public()
  @Get()
  @CheckAbility('read', 'Post')
  @ApiEndpoint({
    summary: 'List posts (paginated).',
    operationId: 'PostsController_list',
    ok: ListPostsResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400'],
  })
  list(
    @Query() query: ListPostsQueryDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ListPostsResponse> {
    return this.posts.list(query, user ?? null);
  }

  @Public()
  @Get(':id')
  @CheckAbility('read', 'Post')
  @ApiParam({ name: 'id', description: 'Post UUID.' })
  @ApiEndpoint({
    summary: 'Get a post by id.',
    operationId: 'PostsController_findOne',
    ok: PostDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '403', '404'],
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<PostT> {
    return this.posts.findOne(id, user ?? null);
  }

  @Post()
  @ApiBody({ type: CreatePostDto })
  @ApiCreatedResponse({ type: PostDto })
  @ApiEndpoint({
    summary: 'Create a post.',
    operationId: 'PostsController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreatePostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostT> {
    return this.posts.create(body, user);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Post UUID.' })
  @ApiBody({ type: UpdatePostDto })
  @ApiOkResponse({ type: PostDto })
  @ApiEndpoint({
    summary: 'Update a post.',
    operationId: 'PostsController_update',
    ok: PostDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostT> {
    return this.posts.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Post UUID.' })
  @ApiNoContentResponse({ description: 'Post deleted.' })
  @ApiEndpoint({
    summary: 'Delete a post.',
    operationId: 'PostsController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.posts.delete(id, user);
  }
}
