import { type AbilityBuilder, type MongoAbility } from '@casl/ability';
import {
  type AppAbilityTuple,
  type AppAction,
  type AppSubject,
  type AppSubjectName,
} from '@repo/contracts/casl';

import { type AuthenticatedUser } from '../auth/auth.types.js';

export { type AppAbilityTuple, type AppAction, type AppSubject, type AppSubjectName };

/** The concrete CASL ability type used everywhere in the backend. */
export type AppAbility = MongoAbility<AppAbilityTuple>;

/**
 * Each module contributes its rules through a class implementing this
 * interface. The factory invokes every contributor's `contributeTo()` with the
 * shared `AbilityBuilder` so rules accumulate in a single ability instance.
 */
export interface AbilityRuleContributor {
  contributeTo(
    builder: AbilityBuilder<AppAbility>,
    user: AuthenticatedUser | null,
  ): void;
}

/** Multi-provider DI token for `AbilityRuleContributor` implementations. */
export const ABILITY_RULES = Symbol('ABILITY_RULES');
