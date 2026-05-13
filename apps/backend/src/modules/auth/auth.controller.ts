import { All, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../infrastructure/auth/public.decorator.js';

import { SessionDto } from './dto/session.dto.js';
import { SignInWithEmailDto } from './dto/sign-in.dto.js';
import { SignUpWithEmailDto } from './dto/sign-up.dto.js';

/**
 * **Documentation-only controller.**
 *
 * The real `/api/auth/*` routes are mounted as an Express sub-application in
 * `main.ts` via `app.use('/api/auth/*', toNodeHandler(auth))`. That `app.use`
 * intercepts incoming requests **before** Nest's router gets the chance to
 * dispatch them, so the methods declared here never execute.
 *
 * Their sole purpose is to make every better-auth endpoint show up in
 * Swagger with proper request/response shapes derived from `@repo/contracts`.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
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
