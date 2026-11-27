import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { TrainingLogAbilityRules } from './training-log.abilities.js';

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
  new TrainingLogAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const session = (userId: string) => ({ __caslSubjectType__: 'TrainingSession' as const, userId });

describe('TrainingLogAbilityRules', () => {
  it('lets a user manage only their own sessions', () => {
    const ability = build(makeUser());
    expect(ability.can('update', session('u-1'))).toBe(true);
    expect(ability.can('delete', session('u-other'))).toBe(false);
  });

  it('gives sysadmin no access to other users’ logs', () => {
    const ability = build(makeUser({ id: 'admin', role: 'sysadmin' }));
    expect(ability.can('read', session('u-1'))).toBe(false);
    expect(ability.can('manage', session('admin'))).toBe(true);
  });

  it('gives anonymous callers nothing', () => {
    expect(build(null).can('read', 'TrainingSession')).toBe(false);
  });
});
