import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AddUserResponse, ListUsersResponse, User } from '@repo/contracts/users';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { AddUserDto } from './dto/add-user.dto.js';
import { AddUserResponseDto } from './dto/add-user-response.dto.js';
import { InviteUserDto } from './dto/invite-user.dto.js';
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

  @Post('invite')
  @CheckAbility('manage', 'User')
  @HttpCode(201)
  @ApiBody({ type: InviteUserDto })
  @ApiCreatedResponse({ type: UserDto })
  @ApiEndpoint({
    summary: 'Invite a new user by email (sysadmin only).',
    operationId: 'UsersController_invite',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '409'],
  })
  invite(
    @Body() body: InviteUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.invite(body, user);
  }

  @Post('add')
  @CheckAbility('manage', 'User')
  @HttpCode(201)
  @ApiBody({ type: AddUserDto })
  @ApiCreatedResponse({ type: AddUserResponseDto })
  @ApiEndpoint({
    summary: 'Add a new user directly, returning a set-password link (sysadmin only).',
    operationId: 'UsersController_add',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '409'],
  })
  add(
    @Body() body: AddUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AddUserResponse> {
    return this.users.addUser(body, user);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiEndpoint({
    summary: 'Get a single user by id.',
    operationId: 'UsersController_findOne',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.findOne(id, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User id.' })
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
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.update(id, body, user);
  }

  @Patch(':id/deactivate')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiEndpoint({
    summary: 'Deactivate a user (sysadmin only).',
    operationId: 'UsersController_deactivate',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.deactivate(id, user);
  }

  @Patch(':id/reactivate')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiEndpoint({
    summary: 'Reactivate a deactivated user (sysadmin only).',
    operationId: 'UsersController_reactivate',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  reactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.reactivate(id, user);
  }

  @Delete(':id')
  @CheckAbility('manage', 'User')
  @HttpCode(204)
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiNoContentResponse({ description: 'User deleted.' })
  @ApiEndpoint({
    summary: 'Hard-delete a user (sysadmin only).',
    operationId: 'UsersController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.users.delete(id, user);
  }

  @Post(':id/send-password-reset')
  @CheckAbility('manage', 'User')
  @HttpCode(204)
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiNoContentResponse({ description: 'Password-reset email sent.' })
  @ApiEndpoint({
    summary: 'Trigger a password-reset email for a user (sysadmin only).',
    operationId: 'UsersController_sendPasswordReset',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  sendPasswordReset(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.users.sendPasswordReset(id, user);
  }
}
