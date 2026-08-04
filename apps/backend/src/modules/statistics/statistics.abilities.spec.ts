import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { StatisticsAbilityRules } from './statistics.abilities.js';

/**
 * Matrix from the Task 4 brief (Step 2), minus row 2 ("orgadmin of X, with
 * ancestor Y, reading organisation Y"). That row depends on
 * `OrganisationsRepository.getAncestorIds`, an async DB call — this
 * contributor's `contributeTo` is synchronous and grants only FLAT,
 * direct-membership rules (see the doc comment on `StatisticsAbilityRules`).
 * The ancestor-rollup behaviour is layered on top in
 * `StatisticsService.assertCanReadOrg`, and is covered by the "ancestor
 * rollup" tests in `statistics.service.spec.ts` instead.
 */
function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u@example.com',
    emailVerified: true,
    name: null,
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

function build(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new StatisticsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

function orgSubject(scopeId: string) {
  return {
    __caslSubjectType__: 'Statistics' as const,
    scopeType: 'organisation' as const,
    scopeId,
  };
}

function userSubject(scopeId: string, organisationId?: string) {
  return {
    __caslSubjectType__: 'Statistics' as const,
    scopeType: 'user' as const,
    scopeId,
    ...(organisationId !== undefined ? { organisationId } : {}),
  };
}

describe('StatisticsAbilityRules', () => {
  it('row 1: sysadmin can read any Statistics instance', () => {
    const ability = build(makeUser({ role: 'sysadmin', memberships: [] }));
    expect(ability.can('read', orgSubject('org-x'))).toBe(true);
    expect(ability.can('read', orgSubject('org-unrelated'))).toBe(true);
    expect(ability.can('read', userSubject('u-9', 'org-z'))).toBe(true);
    expect(ability.can('manage', 'Statistics')).toBe(true);
  });

  it('row 2 (documented, not testable at the flat-contributor level): see statistics.service.spec.ts', () => {
    // Deliberately empty — see file-level doc comment.
    expect(true).toBe(true);
  });

  it('row 3: orgadmin of X can read organisation X', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] }),
    );
    expect(ability.can('read', orgSubject('org-x'))).toBe(true);
  });

  it('row 4: orgadmin of X cannot read an unrelated organisation Z', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] }),
    );
    expect(ability.can('read', orgSubject('org-z'))).toBe(false);
  });

  it('row 5: instructor of X can read a user scoped to X', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-x', role: 'instructor' }] }),
    );
    expect(ability.can('read', userSubject('student-1', 'org-x'))).toBe(true);
  });

  it('row 6: instructor of X cannot read a user scoped to a different org Z', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-x', role: 'instructor' }] }),
    );
    expect(ability.can('read', userSubject('student-1', 'org-z'))).toBe(false);
  });

  it('row 7: a student can read their own user-scoped Statistics', () => {
    const ability = build(makeUser({ id: 'student-1', memberships: [] }));
    expect(ability.can('read', userSubject('student-1'))).toBe(true);
  });

  it('row 8: a student cannot read another user\'s Statistics', () => {
    const ability = build(makeUser({ id: 'student-1', memberships: [] }));
    expect(ability.can('read', userSubject('student-2'))).toBe(false);
  });

  it('row 9: a student cannot read an organisation-scoped instance', () => {
    const ability = build(makeUser({ id: 'student-1', memberships: [] }));
    expect(ability.can('read', orgSubject('org-x'))).toBe(false);
  });

  it('grants no rules for the anonymous viewer', () => {
    const ability = build(null);
    expect(ability.can('read', orgSubject('org-x'))).toBe(false);
    expect(ability.can('read', userSubject('u-1'))).toBe(false);
    expect(ability.can('manage', 'Statistics')).toBe(false);
  });

  it('orgadmin of X can also read a student\'s user-scoped Statistics when the student is in X', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-x', role: 'orgadmin' }] }),
    );
    expect(ability.can('read', userSubject('student-1', 'org-x'))).toBe(true);
    expect(ability.can('read', userSubject('student-1', 'org-z'))).toBe(false);
  });
});
