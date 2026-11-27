import { Controller, Get, Header } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { type AccountExport } from '@repo/contracts/account-export';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { AccountExportService } from './account-export.service.js';

/**
 * GET /api/account/export: the caller's own data as JSON (data portability).
 * Not behind a flag: access to one's own data is a right, not a feature.
 * Self-scoped, so no CASL gate beyond the session.
 */
@ApiTags('account')
@ApiCookieAuth('session')
@Controller('account')
export class AccountExportController {
  constructor(private readonly service: AccountExportService) {}

  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() user: AuthenticatedUser): Promise<AccountExport> {
    return this.service.export(user);
  }
}
