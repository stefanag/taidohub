import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ClubJoinRequestAbilityRules } from './club-join-requests.abilities.js';

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
  new ClubJoinRequestAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const req = (userId: string, organisationId: string) => ({
  __caslSubjectType__: 'ClubJoinRequest' as const,
  userId,
  organisationId,
});

describe('ClubJoinRequestAbilityRules', () => {
  it('lets an applicant create, read and cancel only their own requests', () => {
    const a = build(makeUser());
    expect(a.can('create', req('u-1', 'club'))).toBe(true);
    expect(a.can('delete', req('u-1', 'club'))).toBe(true);
    expect(a.can('read', req('u-2', 'club'))).toBe(false);
    expect(a.can('update', req('u-1', 'club'))).toBe(false);
  });

  it.each(['orgadmin', 'instructor'] as const)(
    'lets a club %s read and decide requests to that club only',
    (role) => {
      const a = build(makeUser({ id: 'staff', memberships: [{ organisationId: 'club', role }] }));
      expect(a.can('update', req('u-1', 'club'))).toBe(true);
      expect(a.can('read', req('u-1', 'club'))).toBe(true);
      expect(a.can('update', req('u-1', 'other-club'))).toBe(false);
    },
  );

  it('does not let a student of the club decide', () => {
    const a = build(
      makeUser({ id: 's', memberships: [{ organisationId: 'club', role: 'student' }] }),
    );
    expect(a.can('update', req('u-1', 'club'))).toBe(false);
  });

  it('gives sysadmin everything and anonymous nothing', () => {
    expect(build(makeUser({ role: 'sysadmin' })).can('update', req('u-1', 'club'))).toBe(true);
    expect(build(null).can('read', 'ClubJoinRequest')).toBe(false);
  });
});
