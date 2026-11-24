import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { StudentAbilityRules } from './students.abilities.js';

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
  new StudentAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const student = (organisationIds: string[]) =>
  ({
    __caslSubjectType__: 'Student' as const,
    organisationIds,
  }) as const;

describe('StudentAbilityRules', () => {
  it('sysadmin manages every student unconditionally', () => {
    const ability = build(makeUser({ role: 'sysadmin' }));
    expect(ability.can('manage', student(['org-a']))).toBe(true);
    expect(ability.can('manage', student(['org-b', 'org-c']))).toBe(true);
    expect(ability.can('manage', student([]))).toBe(true);
  });

  it('instructor in orgs A,B manages students whose orgs overlap, denies disjoint', () => {
    const ability = build(
      makeUser({
        memberships: [
          { organisationId: 'org-a', role: 'instructor' },
          { organisationId: 'org-b', role: 'instructor' },
        ],
      }),
    );

    // Overlap on A.
    expect(ability.can('manage', student(['org-a', 'org-c']))).toBe(true);
    // Single shared org B.
    expect(ability.can('manage', student(['org-b']))).toBe(true);
    // Disjoint — no overlap with A or B.
    expect(ability.can('manage', student(['org-d']))).toBe(false);
    // Unconditional read for routing-level gates.
    expect(ability.can('read', student(['org-d']))).toBe(true);
  });

  it('orgadmin in org A gets a read rule scoped to A and no manage', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-a', role: 'orgadmin' }] }),
    );

    const scoped = ability
      .rulesFor('read', 'Student')
      .filter((rule) => rule.conditions !== undefined);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.matchesConditions(student(['org-a', 'org-c']))).toBe(true);
    expect(scoped[0]!.matchesConditions(student(['org-d']))).toBe(false);
    expect(ability.can('manage', student(['org-a']))).toBe(false);
  });

  it('a plain student gets nothing on Student', () => {
    const ability = build(
      makeUser({ memberships: [{ organisationId: 'org-a', role: 'student' }] }),
    );
    expect(ability.can('read', 'Student')).toBe(false);
  });

  it('anonymous viewer has no permissions on Student', () => {
    const ability = build(null);
    expect(ability.can('manage', student(['org-a']))).toBe(false);
    expect(ability.can('read', student(['org-a']))).toBe(false);
  });
});
