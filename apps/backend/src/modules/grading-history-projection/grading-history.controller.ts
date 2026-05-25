import { Controller, Get, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import type { GradingHistoryResponse } from '@repo/contracts/rank-history';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { GradingHistoryService } from './grading-history.service.js';

@ApiTags('grading-history')
@ApiCookieAuth('session')
@Controller('grading-events')
export class GradingHistoryController {
  constructor(private readonly service: GradingHistoryService) {}

  @Get('history/:userId')
  @CheckAbility('read', 'RankHistory')
  @ApiParam({ name: 'userId', description: 'Subject user id.' })
  @ApiEndpoint({
    summary: 'Unified grading-history projection for a user (event + external).',
    operationId: 'GradingHistoryController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  async list(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GradingHistoryResponse> {
    const data = await this.service.list(userId, user);
    return { data };
  }
}
