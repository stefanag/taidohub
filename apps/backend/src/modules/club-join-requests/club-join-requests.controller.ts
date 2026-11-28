import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  type ClubJoinRequest,
  CreateClubJoinRequestSchema,
  type CreateClubJoinRequestInput,
  type JoinableClub,
} from '@repo/contracts/club-join-requests';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { RequireFeatureFlag } from '../feature-flags/require-feature-flag.decorator.js';

import { ClubJoinRequestsService } from './club-join-requests.service.js';

/**
 * Club join requests. Every endpoint sits behind the `club-join-requests`
 * flag (404 when off; the guard reads method metadata only). Row-level checks
 * live in the service: applicants act on their own requests, the club's
 * orgadmin or instructor decides.
 */
@ApiTags('club-join-requests')
@ApiCookieAuth('session')
@Controller('club-join-requests')
export class ClubJoinRequestsController {
  constructor(private readonly service: ClubJoinRequestsService) {}

  @Get('clubs')
  @RequireFeatureFlag('club-join-requests')
  clubs(): Promise<JoinableClub[]> {
    return this.service.clubs();
  }

  @Get('mine')
  @RequireFeatureFlag('club-join-requests')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<ClubJoinRequest[]> {
    return this.service.mine(user);
  }

  @Get('pending')
  @RequireFeatureFlag('club-join-requests')
  pending(@CurrentUser() user: AuthenticatedUser): Promise<ClubJoinRequest[]> {
    return this.service.pending(user);
  }

  @Post()
  @RequireFeatureFlag('club-join-requests')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateClubJoinRequestSchema)) input: CreateClubJoinRequestInput,
  ): Promise<ClubJoinRequest> {
    return this.service.create(user, input);
  }

  @Delete(':id')
  @RequireFeatureFlag('club-join-requests')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.cancel(user, id);
  }

  @Post(':id/approve')
  @RequireFeatureFlag('club-join-requests')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClubJoinRequest> {
    return this.service.approve(user, id);
  }

  @Post(':id/decline')
  @RequireFeatureFlag('club-join-requests')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClubJoinRequest> {
    return this.service.decline(user, id);
  }
}
