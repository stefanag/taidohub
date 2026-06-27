import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { LabelsAbilityRules } from './labels.abilities.js';

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

function build(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new LabelsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

// CASL `ability.can(action, instance)` resolves the subject type via the
// `__caslSubjectType__` discriminator tagged on each row.
const ORG_TAG = {
  __caslSubjectType__: 'Tag' as const,
  id: 't-1',
  organisationId: 'org-1',
  createdByUserId: 'u-1',
};
const OTHER_ORG_TAG = {
  __caslSubjectType__: 'Tag' as const,
  id: 't-2',
  organisationId: 'org-2',
  createdByUserId: 'u-other',
};
const GLOBAL_TAG = {
  __caslSubjectType__: 'Tag' as const,
  id: 't-3',
  organisationId: null,
  createdByUserId: 'admin',
};

function memberOf(orgIds: string[]): AuthenticatedUser['memberships'] {
  return orgIds.map((organisationId) => ({ organisationId, role: 'orgadmin' as const }));
}

describe('LabelsAbilityRules', () => {
  it('grants sysadmin manage on every label subject', () => {
    const ability = build(baseUser({ role: 'sysadmin' }));
    for (const subject of ['Tag', 'Category', 'TagAttachment', 'CategoryAttachment'] as const) {
      expect(ability.can('manage', subject)).toBe(true);
    }
  });

  it('lets a regular user read own-org and global tags but not other-org', () => {
    const ability = build(baseUser({ id: 'u-1', memberships: memberOf(['org-1']) }));
    expect(ability.can('read', ORG_TAG)).toBe(true);
    expect(ability.can('read', GLOBAL_TAG)).toBe(true);
    expect(ability.can('read', OTHER_ORG_TAG)).toBe(false);
  });

  it('lets the author edit their own org tag', () => {
    const ability = build(baseUser({ id: 'u-1', memberships: memberOf(['org-1']) }));
    expect(ability.can('update', ORG_TAG)).toBe(true);
  });

  it("forbids a regular user from editing another user's tag", () => {
    const ability = build(baseUser({ id: 'u-1', memberships: memberOf(['org-1']) }));
    expect(ability.can('update', { ...ORG_TAG, createdByUserId: 'u-other' })).toBe(false);
  });

  it('forbids a regular user from editing a sysadmin-owned global', () => {
    const ability = build(baseUser({ id: 'u-1', memberships: memberOf(['org-1']) }));
    expect(ability.can('update', GLOBAL_TAG)).toBe(false);
    expect(ability.can('delete', GLOBAL_TAG)).toBe(false);
  });

  it('multi-org user can read tags from any of their orgs', () => {
    const ability = build(baseUser({ id: 'u-1', memberships: memberOf(['org-1', 'org-2']) }));
    expect(ability.can('read', ORG_TAG)).toBe(true);
    expect(ability.can('read', OTHER_ORG_TAG)).toBe(true);
  });

  it('grants no permissions to an anonymous viewer', () => {
    const ability = build(null);
    expect(ability.can('read', ORG_TAG)).toBe(false);
  });
});
