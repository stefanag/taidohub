import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type User } from '@repo/contracts/users';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

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
    return this.users.findOne(user.id);
  }

  @Get()
  @CheckAbility('read', 'User')
  @ApiEndpoint({
    summary: 'List users (admin only).',
    operationId: 'UsersController_list',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
  })
  list(): Promise<User[]> {
    return this.users.list();
  }

  @Get(':id')
  @CheckAbility('read', 'User')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiEndpoint({
    summary: 'Get a single user by id.',
    operationId: 'UsersController_findOne',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
  })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<User> {
    return this.users.findOne(id);
  }
}
