import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { PendingOperationAbilityRules } from './pending-operations.abilities.js';

function abilityFor(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new PendingOperationAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const me: AuthenticatedUser = {
  id: 'me',
  email: 'me@example.com',
  emailVerified: true,
  name: null,
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

describe('PendingOperationAbilityRules', () => {
  it('lets a user read and decide their own proposals', () => {
    const own = subject('PendingOperation', { id: 'op', createdByUserId: 'me' });
    const ability = abilityFor(me);
    expect(ability.can('read', own)).toBe(true);
    expect(ability.can('update', own)).toBe(true);
    expect(ability.can('create', 'PendingOperation')).toBe(true);
  });

  it("refuses someone else's proposal", () => {
    const theirs = subject('PendingOperation', { id: 'op', createdByUserId: 'other' });
    expect(abilityFor(me).can('update', theirs)).toBe(false);
    expect(abilityFor(me).can('read', theirs)).toBe(false);
  });

  it('gives an anonymous caller nothing', () => {
    expect(abilityFor(null).can('read', 'PendingOperation')).toBe(false);
  });
});
