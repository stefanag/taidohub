import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AbilityFactory } from './ability.factory.js';
import { AbilityGuard } from './ability.guard.js';

/**
 * Global ability module.
 *
 * Modules contribute rules via multi-providers on the `ABILITY_RULES` token,
 * declared in each module file. The `AbilityGuard` runs after `AuthGuard`
 * (Nest invokes guards in registration order).
 */
@Global()
@Module({
  providers: [
    AbilityFactory,
    AbilityGuard,
    { provide: APP_GUARD, useClass: AbilityGuard },
  ],
  exports: [AbilityFactory, AbilityGuard],
})
export class AbilityModule {}
