import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { ListAuditLogResponse } from '@repo/contracts/audit-log';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto.js';
import { ListAuditLogResponseDto } from './dto/list-audit-log-response.dto.js';
import { AuditLogService } from './audit-log.service.js';

@ApiTags('audit-log')
@ApiCookieAuth('session')
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @CheckAbility('read', 'AuditLog')
  @ApiEndpoint({
    summary: 'List audit log entries (paginated, latest first).',
    operationId: 'AuditLogController_list',
    ok: ListAuditLogResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListAuditLogQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListAuditLogResponse> {
    return this.audit.list(query, user);
  }
}
