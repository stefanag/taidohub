import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';


import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import {
  ListPendingOperationsQueryDto,
  ListPendingOperationsResponseDto,
  PendingOperationDto,
} from './dto/pending-operation.dto.js';
import { PendingOperationsService } from './pending-operations.service.js';

import type {
  ListPendingOperationsResponse,
  PendingOperation,
} from '@repo/contracts/pending-operations';

/**
 * The web app's side of proposals made by AI clients. Approval exists only
 * here, behind the session cookie: an AI client acting with the user's token
 * must not be able to approve its own proposal.
 */
@ApiTags('pending-operations')
@ApiCookieAuth('session')
@Controller('pending-operations')
export class PendingOperationsController {
  constructor(private readonly service: PendingOperationsService) {}

  @Get()
  @CheckAbility('read', 'PendingOperation')
  @ApiOkResponse({ type: ListPendingOperationsResponseDto })
  @ApiEndpoint({
    summary: "List the caller's own proposals from AI clients, newest first.",
    operationId: 'PendingOperationsController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  async list(
    @Query() query: ListPendingOperationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListPendingOperationsResponse> {
    return { data: await this.service.listMine(user, query.status) };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @CheckAbility('update', 'PendingOperation')
  @ApiParam({ name: 'id', description: 'Pending operation id.' })
  @ApiOkResponse({ type: PendingOperationDto })
  @ApiEndpoint({
    summary:
      'Approve one of your proposals and perform the write. Returns status `failed` with the reason if the write is refused.',
    operationId: 'PendingOperationsController_approve',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PendingOperation> {
    return this.service.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @CheckAbility('update', 'PendingOperation')
  @ApiParam({ name: 'id', description: 'Pending operation id.' })
  @ApiOkResponse({ type: PendingOperationDto })
  @ApiEndpoint({
    summary: 'Reject one of your proposals. Nothing is written.',
    operationId: 'PendingOperationsController_reject',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '404', '409'],
  })
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PendingOperation> {
    return this.service.reject(id, user);
  }
}
