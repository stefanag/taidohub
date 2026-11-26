import { Body, Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { DeleteOwnAccountDto } from './dto/registration.dto.js';
import { RegistrationService } from './registration.service.js';

/**
 * The signed-in user deletes their own account. Open to every user (the
 * right to erasure), not only self-registered ones; the last sysadmin cannot.
 */
@ApiTags('account')
@ApiCookieAuth('session')
@Controller('account')
export class OwnAccountController {
  constructor(private readonly service: RegistrationService) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiEndpoint({
    summary: 'Delete your own account and your own data, after confirming your password.',
    operationId: 'OwnAccountController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '409'],
  })
  delete(@Body() body: DeleteOwnAccountDto, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.service.deleteOwnAccount(user, body.password);
  }
}
