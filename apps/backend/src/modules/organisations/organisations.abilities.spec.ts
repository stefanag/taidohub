import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbilityTuple } from '@repo/contracts/casl';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { OrganisationsAbilityRules } from './organisations.abilities.js';

/**
 * The organisation access matrix is where multi-tenant intent
 * meets row-level access. The rules contributor encodes three
 * independent axes:
 *
 *   - `sysadmin` carries `manage Organisation` (unscoped).
 *   - Each `orgadmin` membership grants `manage` scoped to ONE
 *     organisation id — explicitly FLAT (no inheritance to
 *     children). An orgadmin of the federation cannot edit its
 *     member clubs unless they hold a separate orgadmin
 *     membership on each.
 *   - Each `instructor` membership grants `read` (not manage)
 *     scoped to ONE organisation id.
 *
 * A bug in any of these rules quietly widens or narrows what an
 * orgadmin can edit. The cases below exercise every cell of the
 * matrix.
 */
type AppAbility = MongoAbility<AppAbilityTuple>;

const baseUser = {
  id: 'u',
  email: 'u@x.test',
  emailVerified: true,
  name: null,
  image: null,
  locale: 'en',
  deactivatedAt: null,
};

function buildAbility(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new OrganisationsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

function orgSubject(id: string) {
  return { id, __caslSubjectType__: 'Organisation' as const };
}

describe('OrganisationsAbilityRules', () => {
  it('grants no rules when the user is unauthenticated', () => {
    const ability = buildAbility(null);
    expect(ability.can('read', orgSubject('o-1'))).toBe(false);
    expect(ability.can('manage', orgSubject('o-1'))).toBe(false);
  });

  it('grants a sysadmin manage on every organisation', () => {
    const ability = buildAbility({ ...baseUser, role: 'sysadmin', memberships: [] });
    expect(ability.can('manage', 'Organisation')).toBe(true);
    expect(ability.can('manage', orgSubject('o-1'))).toBe(true);
    expect(ability.can('manage', orgSubject('o-2'))).toBe(true);
    expect(ability.can('read', orgSubject('o-1'))).toBe(true);
  });

  it('grants a plain user (no memberships) nothing', () => {
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    expect(ability.can('read', orgSubject('o-1'))).toBe(false);
    expect(ability.can('manage', orgSubject('o-1'))).toBe(false);
  });

  it('grants an orgadmin manage on their org ONLY', () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [{ organisationId: 'o-self', role: 'orgadmin' }],
    });
    expect(ability.can('manage', orgSubject('o-self'))).toBe(true);
    expect(ability.can('update', orgSubject('o-self'))).toBe(true);
    expect(ability.can('delete', orgSubject('o-self'))).toBe(true);
    // Hard wall: cannot touch any other org.
    expect(ability.can('read', orgSubject('o-other'))).toBe(false);
    expect(ability.can('manage', orgSubject('o-other'))).toBe(false);
  });

  it('does NOT inherit orgadmin rights to nested organisations', () => {
    // Even if `o-child` is a child of `o-parent` in the tree, an
    // orgadmin of `o-parent` does NOT automatically get manage on
    // `o-child`. The rule is flat — the service layer enforces
    // tree-level checks separately when they're needed.
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [{ organisationId: 'o-parent', role: 'orgadmin' }],
    });
    expect(ability.can('manage', orgSubject('o-child'))).toBe(false);
  });

  it('grants an instructor read (not manage) on their club ONLY', () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [{ organisationId: 'club-1', role: 'instructor' }],
    });
    expect(ability.can('read', orgSubject('club-1'))).toBe(true);
    expect(ability.can('manage', orgSubject('club-1'))).toBe(false);
    expect(ability.can('update', orgSubject('club-1'))).toBe(false);
    expect(ability.can('delete', orgSubject('club-1'))).toBe(false);
    // Cannot touch a different club.
    expect(ability.can('read', orgSubject('club-other'))).toBe(false);
  });

  it('treats `student` memberships as conferring no org-level rights', () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [{ organisationId: 'club-1', role: 'student' }],
    });
    expect(ability.can('read', orgSubject('club-1'))).toBe(false);
    expect(ability.can('manage', orgSubject('club-1'))).toBe(false);
  });

  it('layers all memberships when a user holds multiple roles in different orgs', () => {
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [
        { organisationId: 'o-a', role: 'orgadmin' },
        { organisationId: 'club-b', role: 'instructor' },
        { organisationId: 'club-c', role: 'student' },
      ],
    });
    expect(ability.can('manage', orgSubject('o-a'))).toBe(true);
    expect(ability.can('read', orgSubject('club-b'))).toBe(true);
    expect(ability.can('manage', orgSubject('club-b'))).toBe(false);
    expect(ability.can('read', orgSubject('club-c'))).toBe(false);
  });
});
