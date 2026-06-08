import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { FeatureFlagsAbilityRules } from './feature-flags.ability-rules.js';

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
  new FeatureFlagsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('FeatureFlagsAbilityRules', () => {
  it('grants sysadmin manage on FeatureFlag', () => {
    const ability = build(makeUser({ id: 'a-1', role: 'sysadmin' }));
    expect(ability.can('manage', 'FeatureFlag')).toBe(true);
    expect(ability.can('read', 'FeatureFlag')).toBe(true);
    expect(ability.can('update', 'FeatureFlag')).toBe(true);
  });

  it('forbids regular users', () => {
    const ability = build(makeUser({ role: 'user' }));
    expect(ability.can('manage', 'FeatureFlag')).toBe(false);
    expect(ability.can('read', 'FeatureFlag')).toBe(false);
    expect(ability.can('update', 'FeatureFlag')).toBe(false);
  });

  it('forbids the anonymous viewer', () => {
    const ability = build(null);
    expect(ability.can('read', 'FeatureFlag')).toBe(false);
    expect(ability.can('manage', 'FeatureFlag')).toBe(false);
  });
});
