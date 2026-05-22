import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../../infrastructure/auth/public.decorator.js';

import { AuthService } from './auth.service.js';
import { SetInitialPasswordDto } from './dto/set-initial-password.dto.js';

/**
 * Public self-service account actions handled by NestJS.
 *
 * Lives under `/api/account/*`, deliberately OUTSIDE the `/api/auth/*`
 * namespace: `main.ts` mounts better-auth's handler at `/api/auth` as a
 * catch-all that 404s any path it does not own, so a real Nest route cannot
 * be served from there.
 */
@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a password from a one-time invite or reset token.',
    operationId: 'AccountController_setPassword',
    description:
      'Consumes the token, sets the password, marks the email verified, and ' +
      'signs the user in by appending the better-auth session cookie.',
  })
  @ApiBody({ type: SetInitialPasswordDto })
  @ApiOkResponse({ description: 'Password set; session cookie issued.' })
  async setPassword(
    @Body() body: SetInitialPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const headers = await this.authService.setInitialPassword(body);
    for (const cookie of headers.getSetCookie()) {
      res.append('set-cookie', cookie);
    }
    return { ok: true };
  }
}
