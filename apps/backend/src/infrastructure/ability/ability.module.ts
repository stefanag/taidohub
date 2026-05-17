import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuditLogAbilityRules } from '../../modules/audit-log/audit-log.abilities.js';
import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
import { UsersAbilityRules } from '../../modules/users/users.abilities.js';

import { AbilityFactory } from './ability.factory.js';
import { AbilityGuard } from './ability.guard.js';

/**
 * Global ability module.
 *
 * Rule contributors are registered as providers here so `AbilityFactory`
 * can inject them directly. The previous design tried to multi-bind them
 * under the `ABILITY_RULES` token from each feature module — but NestJS
 * doesn't aggregate multiple providers under a single token (that pattern
 * is Angular-specific). Centralising registration here is the simplest
 * approach that actually wires them up.
 *
 * The `AbilityGuard` runs after `AuthGuard` (Nest invokes guards in
 * registration order).
 */
@Global()
@Module({
  providers: [
    AuditLogAbilityRules,
    OrganisationsAbilityRules,
    UsersAbilityRules,
    AbilityFactory,
    AbilityGuard,
    { provide: APP_GUARD, useClass: AbilityGuard },
  ],
  exports: [AbilityFactory, AbilityGuard],
})
export class AbilityModule {}
