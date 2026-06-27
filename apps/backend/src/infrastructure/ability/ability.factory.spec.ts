import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditLogAbilityRules } from '../../modules/audit-log/audit-log.abilities.js';
import { MembershipsAbilityRules } from '../../modules/memberships/memberships.abilities.js';
import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
import { UsersAbilityRules } from '../../modules/users/users.abilities.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { UserContextService } from '../auth/user-context.service.js';

import { AbilityFactory } from './ability.factory.js';

const baseUser = (overrides: Partial<AuthenticatedUser>): AuthenticatedUser => ({
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
});

async function makeFactory(): Promise<AbilityFactory> {
  const module = await Test.createTestingModule({
    providers: [
      AbilityFactory,
      UserContextService,
      UsersAbilityRules,
      OrganisationsAbilityRules,
      AuditLogAbilityRules,
      MembershipsAbilityRules,
    ],
  }).compile();
  return module.get(AbilityFactory);
}

describe('AbilityFactory — sysadmin', () => {
  it('grants manage on every subject', async () => {
    const factory = await makeFactory();
    const ability = factory.createForUser(baseUser({ role: 'sysadmin' }));

    expect(ability.can('manage', 'User')).toBe(true);
    expect(ability.can('manage', 'Organisation')).toBe(true);
    expect(ability.can('read', 'AuditLog')).toBe(true);
    expect(ability.can('manage', 'OrganisationMembership')).toBe(true);
  });
});

describe('AbilityFactory — plain user (no memberships)', () => {
  it('can read their own User row only', async () => {
    const factory = await makeFactory();
    const ability = factory.createForUser(baseUser({ id: 'u-1', role: 'user' }));

    expect(ability.can('read', { __caslSubjectType__: 'User', id: 'u-1' } as any)).toBe(true);
    expect(ability.can('read', { __caslSubjectType__: 'User', id: 'u-2' } as any)).toBe(false);
    expect(ability.can('manage', 'User')).toBe(false);
    expect(ability.can('manage', 'Organisation')).toBe(false);
    expect(ability.can('read', 'AuditLog')).toBe(false);
    expect(ability.can('manage', 'OrganisationMembership')).toBe(false);
  });
});

describe('AbilityFactory — orgadmin', () => {
  it('manages only the bound organisation', async () => {
    const factory = await makeFactory();
    const ability = factory.createForUser(
      baseUser({
        role: 'user',
        memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
      }),
    );

    expect(
      ability.can('manage', { __caslSubjectType__: 'Organisation', id: 'org-A' } as any),
    ).toBe(true);
    expect(
      ability.can('manage', { __caslSubjectType__: 'Organisation', id: 'org-B' } as any),
    ).toBe(false);
    expect(ability.can('manage', 'User')).toBe(false);
    expect(ability.can('manage', 'OrganisationMembership')).toBe(false);
  });

  it('reads audit-log entries for the bound organisation', async () => {
    const factory = await makeFactory();
    const ability = factory.createForUser(
      baseUser({
        memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
      }),
    );

    expect(
      ability.can('read', {
        __caslSubjectType__: 'AuditLog',
        entityType: 'organisation',
        entityId: 'org-A',
      } as any),
    ).toBe(true);
    expect(
      ability.can('read', {
        __caslSubjectType__: 'AuditLog',
        entityType: 'organisation',
        entityId: 'org-B',
      } as any),
    ).toBe(false);
  });
});

describe('AbilityFactory — instructor', () => {
  it('reads the bound club, cannot manage anything', async () => {
    const factory = await makeFactory();
    const ability = factory.createForUser(
      baseUser({
        memberships: [{ organisationId: 'club-X', role: 'instructor' }],
      }),
    );

    expect(
      ability.can('read', { __caslSubjectType__: 'Organisation', id: 'club-X' } as any),
    ).toBe(true);
    expect(
      ability.can('manage', { __caslSubjectType__: 'Organisation', id: 'club-X' } as any),
    ).toBe(false);
    expect(ability.can('read', 'AuditLog')).toBe(false);
  });
});

describe('AbilityFactory — anonymous', () => {
  it('grants nothing', async () => {
    const factory = await makeFactory();
    const ability = factory.createForUser(null);

    expect(ability.can('read', 'User')).toBe(false);
    expect(ability.can('read', 'Organisation')).toBe(false);
    expect(ability.can('read', 'AuditLog')).toBe(false);
    expect(ability.can('read', 'OrganisationMembership')).toBe(false);
  });
});
