import { describe, expect, it } from 'vitest';

import { defineAbilityFor } from './defineAbilityFor.js';

describe('defineAbilityFor', () => {
  it('anonymous: can read only published posts', () => {
    const ability = defineAbilityFor(null);
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(false);
    expect(ability.can('update', 'Post')).toBe(false);
    expect(ability.can('delete', 'Post')).toBe(false);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('regular user: can create posts and update/delete their own', () => {
    const ability = defineAbilityFor({ id: 'u1', role: 'user' });
    expect(ability.can('read', 'Post')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('admin: can manage all', () => {
    const ability = defineAbilityFor({ id: 'u1', role: 'admin' });
    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('create', 'Post')).toBe(true);
    expect(ability.can('delete', 'Post')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(true);
  });

  it('undefined user is treated as anonymous', () => {
    const ability = defineAbilityFor(undefined);
    expect(ability.can('manage', 'all')).toBe(false);
    expect(ability.can('create', 'Post')).toBe(false);
  });
});
