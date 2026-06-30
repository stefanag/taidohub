import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import type { AppAbility } from '../../infrastructure/ability/ability.types.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { GradingRequirementsAbilityRules } from './grading-requirements.ability-rules.js';

function build(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new GradingRequirementsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('GradingRequirementsAbilityRules', () => {
  it('allows sysadmin to manage any RequirementSet', () => {
    const ability = build({
      id: 'u1',
      role: 'sysadmin',
      memberships: [],
    } as unknown as AuthenticatedUser);
    expect(ability.can('manage', 'RequirementSet')).toBe(true);
  });

  it('scopes orgadmin manage to their own org', () => {
    const ability = build({
      id: 'u2',
      role: 'orgadmin',
      memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
    } as unknown as AuthenticatedUser);
    expect(ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: 'org-A' })).toBe(true);
    expect(ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: 'org-B' })).toBe(false);
  });

  it('grants read to any authenticated user', () => {
    const ability = build({
      id: 'u3',
      role: 'student',
      memberships: [],
    } as unknown as AuthenticatedUser);
    expect(ability.can('read', 'RequirementSet')).toBe(true);
  });

  it('denies anonymous', () => {
    const ability = build(null);
    expect(ability.can('read', 'RequirementSet')).toBe(false);
  });
});
