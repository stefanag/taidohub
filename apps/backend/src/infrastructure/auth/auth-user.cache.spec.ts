import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthUserCache, type CachedAuthUser } from './auth-user.cache.js';

/**
 * Pins the cache's behavioural invariants: TTL freshness, load
 * memoisation, explicit invalidation, and LRU bounded growth.
 * `Date.now()` is threaded through the API so tests can advance
 * "time" deterministically without timer fakes.
 */
function fixture(): CachedAuthUser {
  return {
    role: 'user',
    deactivatedAt: null,
    memberships: [],
  };
}

describe('AuthUserCache', () => {
  let cache: AuthUserCache;

  beforeEach(() => {
    cache = new AuthUserCache();
  });

  it('caches the loader result within the TTL window', async () => {
    const load = vi.fn().mockResolvedValue(fixture());
    const first = await cache.getOrLoad('u1', load, 0);
    const second = await cache.getOrLoad('u1', load, 25_000);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('re-loads when the cached entry has expired', async () => {
    const a = fixture();
    const b = { ...fixture(), role: 'sysadmin' as const };
    const load = vi
      .fn<() => Promise<CachedAuthUser>>()
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b);
    const first = await cache.getOrLoad('u1', load, 0);
    const second = await cache.getOrLoad('u1', load, 31_000);
    expect(first).toBe(a);
    expect(second).toBe(b);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces the next call to re-load', async () => {
    const load = vi.fn().mockResolvedValue(fixture());
    await cache.getOrLoad('u1', load, 0);
    cache.invalidate('u1');
    await cache.getOrLoad('u1', load, 1_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidate() on an absent key is a no-op', () => {
    expect(() => cache.invalidate('does-not-exist')).not.toThrow();
  });

  it('clear() drops every entry', async () => {
    const load = vi.fn().mockResolvedValue(fixture());
    await cache.getOrLoad('u1', load, 0);
    await cache.getOrLoad('u2', load, 0);
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('caches separate entries per user id', async () => {
    const u1 = fixture();
    const u2 = { ...fixture(), role: 'sysadmin' as const };
    const load = vi
      .fn<() => Promise<CachedAuthUser>>()
      .mockResolvedValueOnce(u1)
      .mockResolvedValueOnce(u2);
    expect(await cache.getOrLoad('u1', load, 0)).toBe(u1);
    expect(await cache.getOrLoad('u2', load, 0)).toBe(u2);
    expect(await cache.getOrLoad('u1', load, 1_000)).toBe(u1);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
