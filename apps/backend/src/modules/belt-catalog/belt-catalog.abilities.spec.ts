import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { type AppAbilityTuple } from '@repo/contracts/casl';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { BeltCatalogAbilityRules } from './belt-catalog.abilities.js';

/**
 * Belt-catalogue rules are simple but cover three subjects
 * (`BeltSystem`, `BeltRank`, `ShogoTitle`) at once. Two pieces of
 * intent worth pinning explicitly:
 *
 *   1. ANY authenticated user can `read` every subject — these are
 *      reference catalogues that drive form pickers and public
 *      rank pages, not access-controlled data.
 *   2. ONLY sysadmin gets `manage`. There is no orgadmin-scoped
 *      manage on belt-catalog rows — clubs adopt a federation's
 *      belt system, they don't fork it.
 *
 * The third axis (unauthenticated calls) is also pinned: even
 * `read` is denied without a session. The `/public/ranks/:slug`
 * endpoint has its own `@Public()` decoration; it never reaches
 * this rules contributor.
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
  new BeltCatalogAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('BeltCatalogAbilityRules', () => {
  it('grants no rules when the user is unauthenticated', () => {
    const ability = buildAbility(null);
    expect(ability.can('read', 'BeltSystem')).toBe(false);
    expect(ability.can('read', 'BeltRank')).toBe(false);
    expect(ability.can('read', 'ShogoTitle')).toBe(false);
    expect(ability.can('manage', 'BeltSystem')).toBe(false);
  });

  it('grants every authenticated user `read` on all three subjects', () => {
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    expect(ability.can('read', 'BeltSystem')).toBe(true);
    expect(ability.can('read', 'BeltRank')).toBe(true);
    expect(ability.can('read', 'ShogoTitle')).toBe(true);
  });

  it('does NOT grant non-sysadmin users any write actions', () => {
    const ability = buildAbility({ ...baseUser, role: 'user', memberships: [] });
    for (const subject of ['BeltSystem', 'BeltRank', 'ShogoTitle'] as const) {
      expect(ability.can('manage', subject)).toBe(false);
      expect(ability.can('create', subject)).toBe(false);
      expect(ability.can('update', subject)).toBe(false);
      expect(ability.can('delete', subject)).toBe(false);
    }
  });

  it('grants sysadmin `manage` on all three subjects', () => {
    const ability = buildAbility({ ...baseUser, role: 'sysadmin', memberships: [] });
    for (const subject of ['BeltSystem', 'BeltRank', 'ShogoTitle'] as const) {
      expect(ability.can('manage', subject)).toBe(true);
      expect(ability.can('create', subject)).toBe(true);
      expect(ability.can('update', subject)).toBe(true);
      expect(ability.can('delete', subject)).toBe(true);
    }
  });

  it('ignores memberships entirely — global role is the only axis here', () => {
    // Belt-catalog rows are global (or federation-issued and read-only
    // for everyone else). Even an orgadmin gets only `read`, never
    // `manage`. Clubs adopt belt systems; they don't fork them.
    const ability = buildAbility({
      ...baseUser,
      role: 'user',
      memberships: [{ organisationId: 'org-a', role: 'orgadmin' }],
    });
    expect(ability.can('read', 'BeltSystem')).toBe(true);
    expect(ability.can('manage', 'BeltSystem')).toBe(false);
  });
});
