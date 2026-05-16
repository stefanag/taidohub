/**
 * CASL subject + action vocabulary shared by the backend (rule definitions and
 * guards) and the frontend (`<Can>` gating). Keeping the union here ensures
 * both sides agree on the set of permissions.
 */
import { z } from './zod-openapi.js';

/** Zod enum for runtime validation (e.g. parsing config or JSON). */
export const ActionSchema = z.enum(['create', 'read', 'update', 'delete', 'manage']).meta({
  id: 'Action',
  description: 'A CASL action (verb) — `manage` is a wildcard covering every other action.',
  example: 'read',
});

/** Zod enum for runtime validation of subject names. */
export const SubjectSchema = z.enum(['User', 'Organisation', 'all']).meta({
  id: 'Subject',
  description:
    'A CASL subject (noun) the user can act upon. `all` is the wildcard covering every subject.',
  example: 'Organisation',
});

/** TypeScript string-literal unions inferred from the Zod enums. */
export type AppAction = z.infer<typeof ActionSchema>;
/** String-only subject name union (matches the Zod enum). */
export type AppSubjectName = z.infer<typeof SubjectSchema>;

/**
 * Typed subject shapes used by CASL for instance-level rule matching.
 *
 * These describe ONLY the "condition surface area" — the fields that any
 * `builder.can(action, 'Foo', { ... })` rule actually filters on. They are
 * intentionally decoupled from the API DTO and the Drizzle row types: both
 * can be tagged with the `__caslSubjectType__` discriminator and still
 * satisfy these shapes, even though they disagree on e.g. `Date` vs `string`
 * for timestamps.
 *
 * All fields are optional because CASL needs to match arbitrary subsets of
 * conditions and a partially-hydrated subject must still typecheck.
 */
export type UserSubjectShape = {
  readonly __caslSubjectType__: 'User';
  id?: string;
};

export type OrganisationSubjectShape = {
  readonly __caslSubjectType__: 'Organisation';
  id?: string;
};

/**
 * The full CASL subject union: either a bare subject name (for class-level
 * rules like `can('create', 'Organisation')`) or a tagged subject shape (for
 * instance-level rules and for dispatching on a real row passed to
 * `throwUnlessCan`).
 */
export type AppSubject =
  | AppSubjectName
  | UserSubjectShape
  | OrganisationSubjectShape;

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
