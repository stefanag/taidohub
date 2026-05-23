import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import type { UserProfile } from '@repo/contracts/profile';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { UserProfileDto } from './dto/user-profile.dto.js';
import { ProfileService } from './profile.service.js';

/**
 * Profile endpoints. Shares the `/users` prefix with `UsersController` —
 * NestJS serves multiple controllers under one prefix as long as the full
 * route paths are distinct (`/users/me/profile`, `/users/:id/profile` do not
 * collide with `/users/me`, `/users/:id`).
 */
@ApiTags('profile')
@ApiCookieAuth('session')
@Controller('users')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me/profile')
  @ApiEndpoint({
    summary: "Get the current user's own profile.",
    operationId: 'ProfileController_getOwn',
    ok: UserProfileDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401'],
  })
  getOwn(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.profile.getOwn(user);
  }

  @Patch('me/profile')
  @ApiEndpoint({
    summary: "Update the current user's own profile.",
    operationId: 'ProfileController_updateOwn',
    ok: UserProfileDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401'],
  })
  updateOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateUserProfileDto,
  ): Promise<UserProfile> {
    return this.profile.updateOwn(user, body);
  }

  @Get(':id/profile')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiEndpoint({
    summary: "Get any user's profile (sysadmin only).",
    operationId: 'ProfileController_getByUserId',
    ok: UserProfileDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  getByUserId(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfile> {
    return this.profile.getByUserId(id, user);
  }
}
