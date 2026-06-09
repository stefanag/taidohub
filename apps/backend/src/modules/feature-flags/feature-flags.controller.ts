import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  FeatureFlagCodeSchema,
  UpdateFeatureFlagSchema,
  type FeatureFlagCode,
  type FeatureFlagMap,
  type UpdateFeatureFlagInput,
} from '@repo/contracts/feature-flags';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { Public } from '../../infrastructure/auth/public.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { FeatureFlagsService } from './feature-flags.service.js';
import { type FeatureFlagRow } from './feature-flags.repository.js';

/**
 * Public, unauthenticated endpoint that feeds the SPA's `FeatureFlagsProvider`
 * at boot. Anonymous callers must be able to read the resolved map so the
 * frontend can hide gated routes before sign-in.
 *
 * The controller path is bare (no `api/` prefix) — the global prefix is set
 * in `main.ts` via `setGlobalPrefix('api')`.
 */
@ApiTags('feature-flags')
@Controller('feature-flags')
export class FeatureFlagsPublicController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  @Public()
  resolveMap(): Promise<FeatureFlagMap> {
    return this.service.resolveMap();
  }
}

/**
 * Sysadmin-only endpoints — list every row and toggle a single flag.
 *
 * Authorisation is enforced declaratively via `@CheckAbility('manage',
 * 'FeatureFlag')`, which only the sysadmin role's CASL rules satisfy (see
 * `FeatureFlagsAbilityRules`). The global `AuthGuard` runs first and rejects
 * unauthenticated callers with 401 before CASL ever sees the request.
 */
@ApiTags('feature-flags')
@ApiCookieAuth('session')
@Controller('admin/feature-flags')
export class FeatureFlagsAdminController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  @CheckAbility('manage', 'FeatureFlag')
  listRows(): Promise<FeatureFlagRow[]> {
    return this.service.listRows();
  }

  @Patch(':code')
  @CheckAbility('manage', 'FeatureFlag')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', new ZodValidationPipe(FeatureFlagCodeSchema)) code: FeatureFlagCode,
    @Body(new ZodValidationPipe(UpdateFeatureFlagSchema)) body: UpdateFeatureFlagInput,
  ): Promise<FeatureFlagRow> {
    return this.service.setEnabled(code, body.enabled, user);
  }
}
