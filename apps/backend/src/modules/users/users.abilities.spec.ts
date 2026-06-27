import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbilityTuple } from '@repo/contracts/casl';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { UsersAbilityRules } from './users.abilities.js';

/**
 * The user access matrix has two pieces of intent that have to
 * stay separable in the rule graph:
 *
 *   - `sysadmin` carries `manage User` — meaning every action,
 *     unscoped. A CASL `manage` is shorthand for "any of
 *     create|read|update|delete + custom verbs."
 *   - Everyone else gets `read User { id: self }` — the *bare*
 *     subject string `User` matches if ANY rule grants action
 *     `read` on `User`, so we MUST use the conditional form
 *     `(action, subject, conditions)` or `.can(action, instance)`
 *     to express "only your own row." Forgetting the condition
 *     would silently let any authenticated user read every other
 *     user's row.
 *
 * Both forms are exercised below.
 */
type AppAbility = MongoAbility<AppAbilityTuple>;

const baseUser = {
  id: 'u-self',
  email: 'self@x.test',
  emailVerified: true,
  name: null,
  image: null,
  locale: 'en',
  deactivatedAt: null,
};

function buildAbility(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new UsersAbilityRules().contributeTo(builder, user);
  return builder.build();
}

function userSubject(id: string) {
  return { id, __caslSubjectType__: 'User' as const };
}

describe('UsersAbilityRules', () => {
  it('grants no rules when the user is unauthenticated', () => {
    const ability = buildAbility(null);
    expect(ability.can('read', 'User')).toBe(false);
    expect(ability.can('read', userSubject('u-self'))).toBe(false);
    expect(ability.can('manage', 'User')).toBe(false);
  });

  it('grants a sysadmin manage on every user', () => {
    const ability = buildAbility({ ...baseUser, role: 'sysadmin', memberships: [] });
    // Bare subject string short-circuits because the manage rule has no conditions.
    expect(ability.can('manage', 'User')).toBe(true);
    expect(ability.can('read', 'User')).toBe(true);
    expect(ability.can('update', 'User')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
    // Per-row checks still match — `manage` covers every action on every instance.
    expect(ability.can('read', userSubject('someone-else'))).toBe(true);
    expect(ability.can('update', userSubject('someone-else'))).toBe(true);
  });

  it('grants a plain user `read` ONLY on their own row', () => {
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    expect(ability.can('read', userSubject('u-self'))).toBe(true);
    expect(ability.can('read', userSubject('someone-else'))).toBe(false);
  });

  it('the bare subject string check is meaningless when only conditional rules exist', () => {
    // CASL's `.can(action, subjectName)` returns true whenever ANY rule
    // for that (action, subject) exists, even a conditional one — the
    // bare-string variant checks "can this user perform this action on
    // ANY instance of this subject," not "without any constraint." For
    // real safety, the call site MUST pass an instance object so the
    // condition can match. The test below pins the documented CASL
    // behaviour so a future maintainer reading this rule isn't misled
    // into thinking the bare check is the gate.
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    expect(ability.can('read', 'User')).toBe(true);
    // The actual gate is the instance check.
    expect(ability.can('read', userSubject('someone-else'))).toBe(false);
  });

  it('forbids write actions on the plain user even for their own row', () => {
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    expect(ability.can('update', userSubject('u-self'))).toBe(false);
    expect(ability.can('delete', userSubject('u-self'))).toBe(false);
    expect(ability.can('manage', userSubject('u-self'))).toBe(false);
  });

  it("ignores the user's memberships — role is the only axis here", () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [
        { organisationId: 'org-a', role: 'orgadmin' },
        { organisationId: 'org-b', role: 'instructor' },
      ],
    });
    // Even orgadmin in some org doesn't grant cross-row read — that
    // intentionally lives in the organisation/membership modules.
    expect(ability.can('read', userSubject('someone-else'))).toBe(false);
    expect(ability.can('read', userSubject('u-self'))).toBe(true);
  });
});
