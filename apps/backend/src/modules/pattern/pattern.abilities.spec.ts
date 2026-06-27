import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { PatternAbilityRules } from './pattern.abilities.js';

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
  new PatternAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const pat = (org: string | null) =>
  ({
    __caslSubjectType__: 'Pattern' as const,
    createdByOrganisationId: org,
  }) as const;

describe('PatternAbilityRules', () => {
  it('sysadmin manages every pattern (global, own org, other org)', () => {
    const ability = build(makeUser({ role: 'sysadmin' }));
    expect(ability.can('manage', pat(null))).toBe(true);
    expect(ability.can('manage', pat('org-A'))).toBe(true);
    expect(ability.can('manage', pat('org-B'))).toBe(true);
    expect(ability.can('read', 'Pattern')).toBe(true);
  });

  it('orgadmin in org A manages org A but not org B and not global', () => {
    const ability = build(
      makeUser({
        memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
      }),
    );
    expect(ability.can('manage', pat('org-A'))).toBe(true);
    expect(ability.can('manage', pat('org-B'))).toBe(false);
    expect(ability.can('manage', pat(null))).toBe(false);
    expect(ability.can('create', 'Pattern')).toBe(true);
    expect(ability.can('read', 'Pattern')).toBe(true);
  });

  it('regular user can read but cannot create / manage', () => {
    const ability = build(makeUser({ role: 'user' }));
    expect(ability.can('read', 'Pattern')).toBe(true);
    expect(ability.can('create', 'Pattern')).toBe(false);
    expect(ability.can('manage', pat('org-A'))).toBe(false);
    expect(ability.can('update', pat('org-A'))).toBe(false);
  });

  it('anonymous viewer has no permissions', () => {
    const ability = build(null);
    expect(ability.can('read', 'Pattern')).toBe(false);
    expect(ability.can('create', 'Pattern')).toBe(false);
    expect(ability.can('manage', pat('org-A'))).toBe(false);
  });
});
