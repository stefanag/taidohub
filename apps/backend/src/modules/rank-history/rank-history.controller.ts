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
import type { RankHistory } from '@repo/contracts/rank-history';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { RequireFeatureFlag } from '../feature-flags/require-feature-flag.decorator.js';

import { CreateRankHistoryDto } from './dto/create-rank-history.dto.js';
import { RankHistoryDto } from './dto/rank-history.dto.js';
import { UpdateRankHistoryDto } from './dto/update-rank-history.dto.js';
import { RankHistoryService } from './rank-history.service.js';

@ApiTags('rank-history')
@ApiCookieAuth('session')
@Controller('rank-history')
export class RankHistoryController {
  constructor(private readonly service: RankHistoryService) {}

  @Get(':userId')
  @CheckAbility('read', 'RankHistory')
  @ApiParam({ name: 'userId', description: 'Subject user id.' })
  @ApiEndpoint({
    summary: "List a user's raw rank-history rows (admin/self-only).",
    operationId: 'RankHistoryController_listForUser',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  listForUser(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory[]> {
    return this.service.list(userId, user);
  }

  @Post(':userId')
  @RequireFeatureFlag('grading-history')
  @CheckAbility('create', 'RankHistory')
  @ApiParam({ name: 'userId', description: 'Subject user id.' })
  @ApiBody({ type: CreateRankHistoryDto })
  @ApiCreatedResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Create an external rank-history entry for a user.',
    operationId: 'RankHistoryController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Param('userId') userId: string,
    @Body() body: CreateRankHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.create(userId, body, user);
  }

  @Patch(':id')
  @RequireFeatureFlag('grading-history')
  @CheckAbility('update', 'RankHistory')
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiBody({ type: UpdateRankHistoryDto })
  @ApiOkResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Update an external rank-history entry.',
    operationId: 'RankHistoryController_update',
    ok: RankHistoryDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRankHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequireFeatureFlag('grading-history')
  @CheckAbility('delete', 'RankHistory')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiNoContentResponse({ description: 'Rank-history row deleted.' })
  @ApiEndpoint({
    summary: 'Delete an external rank-history entry.',
    operationId: 'RankHistoryController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.service.delete(id, user);
  }

  @Post(':id/verify')
  @RequireFeatureFlag('grading-history-verification')
  @CheckAbility('update', 'RankHistory')
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiOkResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Verify a rank-history row.',
    operationId: 'RankHistoryController_verify',
    ok: RankHistoryDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  verify(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.verify(id, user);
  }

  @Post(':id/unverify')
  @RequireFeatureFlag('grading-history-verification')
  @CheckAbility('update', 'RankHistory')
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiOkResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Unverify a rank-history row.',
    operationId: 'RankHistoryController_unverify',
    ok: RankHistoryDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  unverify(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.unverify(id, user);
  }
}
