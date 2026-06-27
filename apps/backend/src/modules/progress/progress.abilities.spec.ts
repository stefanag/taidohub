import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ProgressAbilityRules } from './progress.abilities.js';

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
  new ProgressAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const prog = (userId: string) =>
  ({
    __caslSubjectType__: 'Progress' as const,
    userId,
  }) as const;

describe('ProgressAbilityRules', () => {
  it('sysadmin manages every progress row (own and other users)', () => {
    const ability = build(makeUser({ role: 'sysadmin' }));
    expect(ability.can('manage', prog('u-1'))).toBe(true);
    expect(ability.can('manage', prog('u-other'))).toBe(true);
  });

  it('regular user manages only their own rows', () => {
    const ability = build(makeUser({ id: 'me' }));
    expect(ability.can('manage', prog('me'))).toBe(true);
    expect(ability.can('manage', prog('other'))).toBe(false);
    expect(ability.can('update', prog('other'))).toBe(false);
    expect(ability.can('delete', prog('other'))).toBe(false);
  });

  it('anonymous viewer has no permissions', () => {
    const ability = build(null);
    expect(ability.can('manage', prog('u-1'))).toBe(false);
    expect(ability.can('read', prog('u-1'))).toBe(false);
  });
});
