import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { ListUsersResponse, User } from '@repo/contracts/users';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ListUsersResponseDto } from './dto/list-users-response.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiCookieAuth('session')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user.', operationId: 'UsersController_me' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthenticatedUser | undefined): Promise<User> {
    if (!user) {
      // `AuthGuard` should have rejected the request already; defensive only.
      throw new Error('CurrentUser missing on a non-public route.');
    }
    return this.users.findOne(user.id, user);
  }

  @Get()
  @CheckAbility('manage', 'User')
  @ApiEndpoint({
    summary: 'List users — paginated and filterable (sysadmin only).',
    operationId: 'UsersController_list',
    ok: ListUsersResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListUsersResponse> {
    return this.users.list(query, user);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiEndpoint({
    summary: 'Get a single user by id.',
    operationId: 'UsersController_findOne',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.findOne(id, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserDto })
  @ApiEndpoint({
    summary: "Update a user's name or role (sysadmin only).",
    operationId: 'UsersController_update',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.update(id, body, user);
  }
}
