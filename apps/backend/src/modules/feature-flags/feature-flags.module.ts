import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import {
  FeatureFlagsAdminController,
  FeatureFlagsPublicController,
} from './feature-flags.controller.js';
import { FeatureFlagsRepository } from './feature-flags.repository.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FeatureFlagGuard } from './feature-flag.guard.js';

/**
 * `DatabaseModule` (Drizzle), `AbilityModule`, and `AuditLogModule` are all
 * `@Global`, so they don't need to be imported here.
 *
 * `FeatureFlagsAbilityRules` is registered in `AbilityModule` alongside the
 * other rule contributors — re-declaring it here would create a second
 * instance with a different identity.
 *
 * The `FeatureFlagGuard` is registered globally so any handler can opt in
 * to flag-gating via the `@RequireFeatureFlag(code)` metadata decorator;
 * routes that don't carry the metadata pass straight through. The order in
 * the providers list does not matter because guards from different modules
 * are concatenated; Nest invokes them in registration order across the
 * whole app, and the global `AuthGuard` is already registered first via
 * `InfraAuthModule`.
 *
 * `FeatureFlagsService` is exported so future modules that need to read a
 * flag programmatically (outside the guard) can inject it directly.
 */
@Module({
  controllers: [FeatureFlagsPublicController, FeatureFlagsAdminController],
  providers: [
    FeatureFlagsRepository,
    FeatureFlagsService,
    FeatureFlagGuard,
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
  ],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
