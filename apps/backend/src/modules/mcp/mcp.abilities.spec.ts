import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { McpAbilityRules } from './mcp.abilities.js';

function abilityFor(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new McpAbilityRules().contributeTo(builder, user);
  return builder.build();
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'u1@example.com',
    emailVerified: true,
    name: 'U1',
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

const ORG = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

describe('McpAbilityRules', () => {
  it('lets a sysadmin use MCP', () => {
    expect(abilityFor(user({ role: 'sysadmin' })).can('use', 'Mcp')).toBe(true);
  });

  it('lets an orgadmin use MCP', () => {
    const orgadmin = user({ memberships: [{ organisationId: ORG, role: 'orgadmin' }] });
    expect(abilityFor(orgadmin).can('use', 'Mcp')).toBe(true);
  });

  it.each(['instructor', 'student'] as const)('refuses a %s', (role) => {
    const member = user({ memberships: [{ organisationId: ORG, role }] });
    expect(abilityFor(member).can('use', 'Mcp')).toBe(false);
  });

  it('refuses a plain user, an anonymous caller and a deactivated sysadmin', () => {
    expect(abilityFor(user()).can('use', 'Mcp')).toBe(false);
    expect(abilityFor(null).can('use', 'Mcp')).toBe(false);
    expect(
      abilityFor(user({ role: 'sysadmin', deactivatedAt: '2026-11-01T00:00:00.000Z' })).can('use', 'Mcp'),
    ).toBe(false);
  });
});
