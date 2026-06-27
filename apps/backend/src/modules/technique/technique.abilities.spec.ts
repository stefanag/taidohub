import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { TechniqueAbilityRules } from './technique.abilities.js';

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
  new TechniqueAbilityRules().contributeTo(builder, user);
  return builder.build();
}

const tech = (org: string | null) =>
  ({
    __caslSubjectType__: 'Technique' as const,
    createdByOrganisationId: org,
  }) as const;

describe('TechniqueAbilityRules', () => {
  it('sysadmin manages every technique (global, own org, other org)', () => {
    const ability = build(makeUser({ role: 'sysadmin' }));
    expect(ability.can('manage', tech(null))).toBe(true);
    expect(ability.can('manage', tech('org-A'))).toBe(true);
    expect(ability.can('manage', tech('org-B'))).toBe(true);
    expect(ability.can('read', 'Technique')).toBe(true);
  });

  it('orgadmin in org A manages org A but not org B and not global', () => {
    const ability = build(
      makeUser({
        memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
      }),
    );
    expect(ability.can('manage', tech('org-A'))).toBe(true);
    expect(ability.can('manage', tech('org-B'))).toBe(false);
    expect(ability.can('manage', tech(null))).toBe(false);
    expect(ability.can('create', 'Technique')).toBe(true);
    expect(ability.can('read', 'Technique')).toBe(true);
  });

  it('regular user can read but cannot create / manage', () => {
    const ability = build(makeUser({ role: 'user' }));
    expect(ability.can('read', 'Technique')).toBe(true);
    expect(ability.can('create', 'Technique')).toBe(false);
    expect(ability.can('manage', tech('org-A'))).toBe(false);
    expect(ability.can('update', tech('org-A'))).toBe(false);
  });

  it('anonymous viewer has no permissions', () => {
    const ability = build(null);
    expect(ability.can('read', 'Technique')).toBe(false);
    expect(ability.can('create', 'Technique')).toBe(false);
    expect(ability.can('manage', tech('org-A'))).toBe(false);
  });
});
