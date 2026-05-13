/**
 * CASL subject + action vocabulary shared by the backend (rule definitions and
 * guards) and the frontend (`<Can>` gating). Keeping the union here ensures
 * both sides agree on the set of permissions.
 */
import { z } from './zod-openapi.js';

/** Zod enum for runtime validation (e.g. parsing config or JSON). */
export const ActionSchema = z.enum(['create', 'read', 'update', 'delete', 'manage']).openapi({
  title: 'Action',
  description: 'A CASL action (verb) — `manage` is a wildcard covering every other action.',
  example: 'read',
});

/** Zod enum for runtime validation of subject names. */
export const SubjectSchema = z.enum(['Post', 'User', 'all']).openapi({
  title: 'Subject',
  description:
    'A CASL subject (noun) the user can act upon. `all` is the wildcard covering every subject.',
  example: 'Post',
});

/** TypeScript string-literal unions inferred from the Zod enums. */
export type AppAction = z.infer<typeof ActionSchema>;
export type AppSubject = z.infer<typeof SubjectSchema>;

/**
 * Tuple type compatible with `MongoAbility<[AppAction, AppSubject]>` from
 * `@casl/ability`. Consumers re-export their own ability type using this:
 *
 *   import type { MongoAbility } from '@casl/ability';
 *   import type { AppAbilityTuple } from '@repo/contracts/casl';
 *   export type AppAbility = MongoAbility<AppAbilityTuple>;
 */
export type AppAbilityTuple = [AppAction, AppSubject];

export const Actions = ActionSchema.options;
export const Subjects = SubjectSchema.options;
