import { All, Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../../infrastructure/auth/public.decorator.js';

import { AuthService } from './auth.service.js';
import { SetInitialPasswordDto } from './dto/set-initial-password.dto.js';
import { SessionDto } from './dto/session.dto.js';
import { SignInWithEmailDto } from './dto/sign-in.dto.js';
import { SignUpWithEmailDto } from './dto/sign-up.dto.js';

/**
 * Auth controller.
 *
 * `set-initial-password` is a real Nest-handled endpoint implemented in
 * {@link AuthService}.
 *
 * All other routes (`sign-in/email`, `sign-up/email`, `sign-out`,
 * `get-session`) are documentation-only stubs: the real handlers are mounted
 * as an Express sub-application in `main.ts` via
 * `app.use('/api/auth/*', toNodeHandler(auth))`, which intercepts requests
 * before Nest's router, so those stub methods never execute. Their sole
 * purpose is to expose the better-auth endpoints in Swagger with the correct
 * request/response shapes from `@repo/contracts`.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('set-initial-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a password from a one-time invite or reset token.',
    operationId: 'AuthController_setInitialPassword',
    description:
      'Consumes the token, sets the password, marks the email verified, and ' +
      'signs the user in by appending the better-auth session cookie.',
  })
  @ApiBody({ type: SetInitialPasswordDto })
  @ApiOkResponse({ description: 'Password set; session cookie issued.' })
  async setInitialPassword(
    @Body() body: SetInitialPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const headers = await this.authService.setInitialPassword(body);
    for (const cookie of headers.getSetCookie()) {
      res.append('set-cookie', cookie);
    }
    return { ok: true };
  }

  @Public()
  @Post('sign-in/email')
  @ApiOperation({
    summary: 'Sign in with email + password.',
    operationId: 'AuthController_signInEmail',
    description:
      'Issues a `better-auth.session_token` HTTP-only cookie on success. ' +
      'The actual handler is provided by better-auth.',
  })
  @ApiBody({ type: SignInWithEmailDto })
  @ApiOkResponse({ type: SessionDto })
  signInEmail(): void {
    /* handled by better-auth */
  }

  @Public()
  @Post('sign-up/email')
  @ApiOperation({
    summary: 'Create a new account with email + password.',
    operationId: 'AuthController_signUpEmail',
  })
  @ApiBody({ type: SignUpWithEmailDto })
  @ApiOkResponse({ type: SessionDto })
  signUpEmail(): void {
    /* handled by better-auth */
  }

  @ApiCookieAuth('session')
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sign out and clear the session cookie.',
    operationId: 'AuthController_signOut',
  })
  @ApiNoContentResponse({ description: 'Session terminated.' })
  signOut(): void {
    /* handled by better-auth */
  }

  @ApiCookieAuth('session')
  @All('get-session')
  @ApiOperation({
    summary: 'Get the active session for the caller.',
    operationId: 'AuthController_getSession',
  })
  @ApiOkResponse({ type: SessionDto })
  getSession(): void {
    /* handled by better-auth */
  }
}
