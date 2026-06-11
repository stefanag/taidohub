import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ClassificationCategoryAbilityRules } from './classification-category.ability-rules.js';

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
  new ClassificationCategoryAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('ClassificationCategoryAbilityRules', () => {
  it('grants sysadmin manage on ClassificationCategory', () => {
    const ability = build(makeUser({ id: 's-1', role: 'sysadmin' }));
    expect(ability.can('manage', 'ClassificationCategory')).toBe(true);
    expect(ability.can('read', 'ClassificationCategory')).toBe(true);
    expect(ability.can('update', 'ClassificationCategory')).toBe(true);
  });

  it('lets a regular user read but not manage', () => {
    const ability = build(makeUser({ role: 'user' }));
    expect(ability.can('read', 'ClassificationCategory')).toBe(true);
    expect(ability.can('manage', 'ClassificationCategory')).toBe(false);
    expect(ability.can('update', 'ClassificationCategory')).toBe(false);
  });

  it('forbids the anonymous viewer', () => {
    const ability = build(null);
    expect(ability.can('read', 'ClassificationCategory')).toBe(false);
    expect(ability.can('manage', 'ClassificationCategory')).toBe(false);
  });
});
