import { Global, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { type Env } from '../../config/env.schema.js';

import { AuthGuard } from './auth.guard.js';
import { BETTER_AUTH, buildBetterAuth } from './better-auth.js';
import { VerificationTokenService } from './verification-token.service.js';

const betterAuthProvider: Provider = {
  provide: BETTER_AUTH,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const backendUrl = config.get('BACKEND_URL', { infer: true });
    const enableSwagger = config.get('ENABLE_SWAGGER', { infer: true });
    const env: Env = {
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      PORT: config.get('PORT', { infer: true }),
      WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
      DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
      DIRECT_URL: config.get('DIRECT_URL', { infer: true }),
      BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
      BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
      SYSADMIN_EMAIL: config.get('SYSADMIN_EMAIL', { infer: true }),
      SYSADMIN_PASSWORD: config.get('SYSADMIN_PASSWORD', { infer: true }),
      INVITE_TOKEN_TTL_HOURS: config.get('INVITE_TOKEN_TTL_HOURS', { infer: true }),
      RESET_TOKEN_TTL_HOURS: config.get('RESET_TOKEN_TTL_HOURS', { infer: true }),
      ...(backendUrl !== undefined ? { BACKEND_URL: backendUrl } : {}),
      ...(enableSwagger !== undefined ? { ENABLE_SWAGGER: enableSwagger } : {}),
    };
    return buildBetterAuth(env);
  },
};

/**
 * Global auth module.
 *
 * The actual `/api/auth/*` HTTP routes are mounted as an Express
 * sub-application in `main.ts` (via `toNodeHandler(auth)`) **before** Nest's
 * router is installed. This module is responsible for:
 *   1. Exposing the `Auth` instance to the rest of the app via the
 *      `BETTER_AUTH` DI token.
 *   2. Registering `AuthGuard` as a global guard so every non-`@Public()`
 *      route requires a valid session cookie.
 */
@Global()
@Module({
  providers: [
    betterAuthProvider,
    AuthGuard,
    VerificationTokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [betterAuthProvider, AuthGuard, VerificationTokenService],
})
export class InfraAuthModule {}
