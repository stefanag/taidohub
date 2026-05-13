import { SetMetadata } from '@nestjs/common';

import { type AppAction, type AppSubject } from './ability.types';

export interface RequiredAbility {
  action: AppAction;
  subject: AppSubject;
}

export const CHECK_ABILITY_KEY = 'check-ability';

/**
 * Attach a single ability requirement to a handler. The `AbilityGuard` reads
 * the metadata and throws `ForbiddenException` when the current user's
 * ability rejects it.
 *
 *   @CheckAbility('read', 'Post')
 *   @Get(':id')
 *   findOne(@Param('id') id: string) { ... }
 */
export const CheckAbility = (action: AppAction, subject: AppSubject) =>
  SetMetadata(CHECK_ABILITY_KEY, [{ action, subject }] as RequiredAbility[]);

/**
 * Attach multiple ability requirements — all must pass.
 */
export const CheckAbilities = (...abilities: RequiredAbility[]) =>
  SetMetadata(CHECK_ABILITY_KEY, abilities);
