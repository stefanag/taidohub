import { describe, expect, it } from 'vitest';

import { defineAbilityFor } from './defineAbilityFor.js';

describe('defineAbilityFor', () => {
  it('anonymous: no permissions', () => {
    const ability = defineAbilityFor(null);
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('manage', 'Organisation')).toBe(false);
    expect(ability.can('manage', 'User')).toBe(false);
  });

  it('regular user: no domain permissions', () => {
    const ability = defineAbilityFor({ id: 'u1', role: 'user' });
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('manage', 'Organisation')).toBe(false);
  });

  it('admin: can manage all', () => {
    const ability = defineAbilityFor({ id: 'u1', role: 'admin' });
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('manage', 'Organisation')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(true);
  });

  it('undefined user is treated as anonymous', () => {
    const ability = defineAbilityFor(undefined);
    expect(ability.can('manage', 'all')).toBe(false);
  });
});
