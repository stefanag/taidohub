import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { Public } from '../../infrastructure/auth/public.decorator.js';
import { RequireFeatureFlag } from '../feature-flags/require-feature-flag.decorator.js';

import {
  RegisterInputDto,
  RegisterResponseDto,
  RegisterWithGoogleDto,
  RegistrationIntentDto,
  RegistrationFederationDto,
  RegistrationLegalTextsDto,
  RegistrationLegalTextsQueryDto,
} from './dto/registration.dto.js';
import { RegistrationService } from './registration.service.js';

import type { ApplicableLegalTexts } from '@repo/contracts/legal-documents';
import type {
  RegisterResponse,
  RegistrationFederation,
  RegistrationIntent,
} from '@repo/contracts/registration';
import type { Request } from 'express';

/**
 * The client's address for rate limiting. Caddy sets X-Forwarded-For to the
 * address it saw, so the last entry is the one it vouches for.
 */
function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
  return value?.split(',').at(-1)?.trim() || req.ip || 'unknown';
}

/** Public self-registration, behind the `self-registration` feature flag (404 while off). */
@ApiTags('registration')
@Controller('registration')
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}

  @Post()
  @Public()
  @RequireFeatureFlag('self-registration')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiEndpoint({
    summary:
      'Create an account without a club. Sends a confirmation email; the account can sign in once confirmed. Answers the same for an address that already has an account.',
    operationId: 'RegistrationController_register',
    ok: RegisterResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '404'],
  })
  register(@Body() body: RegisterInputDto, @Req() req: Request): Promise<RegisterResponse> {
    return this.service.register(body, clientKey(req));
  }

  @Post('google-intent')
  @Public()
  @RequireFeatureFlag('self-registration')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary:
      'Check age, federation and accepted texts before a Google sign-up, and return the intent to pass to the Google sign-in.',
    operationId: 'RegistrationController_googleIntent',
    ok: RegistrationIntentDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '404'],
  })
  googleIntent(@Body() body: RegisterWithGoogleDto, @Req() req: Request): Promise<RegistrationIntent> {
    return this.service.createGoogleIntent(body, clientKey(req));
  }

  @Get('federations')
  @Public()
  @RequireFeatureFlag('self-registration')
  @ApiEndpoint({
    summary: 'The national federations to choose from at registration.',
    operationId: 'RegistrationController_federations',
    ok: RegistrationFederationDto,
    errorType: ErrorEnvelopeDto,
    errors: ['404'],
  })
  federations(): Promise<RegistrationFederation[]> {
    return this.service.federations();
  }

  @Get('legal-texts')
  @Public()
  @RequireFeatureFlag('self-registration')
  @ApiEndpoint({
    summary: "The platform's terms and privacy notice for self-registered users.",
    operationId: 'RegistrationController_legalTexts',
    ok: RegistrationLegalTextsDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '404'],
  })
  legalTexts(@Query() query: RegistrationLegalTextsQueryDto): Promise<ApplicableLegalTexts> {
    return this.service.legalTexts(query.locale);
  }
}
