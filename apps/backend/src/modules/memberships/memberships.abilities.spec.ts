import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, it, expect } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { MembershipsAbilityRules } from './memberships.abilities.js';

function buildFor(user: any): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new MembershipsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('MembershipsAbilityRules', () => {
  it('sysadmin can manage every OrganisationMembership', () => {
    const ability = buildFor({ id: 'u1', role: 'sysadmin', memberships: [] });
    expect(
      ability.can('manage', {
        __caslSubjectType__: 'OrganisationMembership' as const,
        organisationId: 'any',
        role: 'orgadmin' as const,
      }),
    ).toBe(true);
  });

  it('orgadmin in org A can read all roles in org A but not in org B', () => {
    const ability = buildFor({
      id: 'u1',
      role: 'user',
      memberships: [{ organisationId: 'A', role: 'orgadmin' }],
    });
    const orgadminInA = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'A',
      role: 'orgadmin' as const,
    };
    const instructorInB = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'B',
      role: 'instructor' as const,
    };
    expect(ability.can('read', orgadminInA)).toBe(true);
    expect(ability.can('read', instructorInB)).toBe(false);
  });

  it('orgadmin can create + delete instructor rows in their org but not orgadmin rows', () => {
    const ability = buildFor({
      id: 'u1',
      role: 'user',
      memberships: [{ organisationId: 'A', role: 'orgadmin' }],
    });
    const instructorInA = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'A',
      role: 'instructor' as const,
    };
    const orgadminInA = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'A',
      role: 'orgadmin' as const,
    };
    expect(ability.can('create', instructorInA)).toBe(true);
    expect(ability.can('delete', instructorInA)).toBe(true);
    expect(ability.can('create', orgadminInA)).toBe(false);
    expect(ability.can('delete', orgadminInA)).toBe(false);
    expect(ability.can('update', instructorInA)).toBe(false);
  });

  it('anonymous gets nothing', () => {
    const ability = buildFor(null);
    expect(
      ability.can('read', {
        __caslSubjectType__: 'OrganisationMembership' as const,
        organisationId: 'A',
        role: 'instructor' as const,
      }),
    ).toBe(false);
  });
});
