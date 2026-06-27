import { Injectable } from '@nestjs/common';

import type { MembershipRole } from '@repo/contracts/memberships';
import type { Role } from '@repo/contracts/users';

/**
 * Cached tuple read out of `user` + `organisation_membership` on
 * each authenticated request. Together with the session payload
 * from better-auth it produces `req.user`. Names mirror the
 * schema columns so the cache is a 1:1 stand-in for the SELECTs
 * it replaces.
 */
export interface CachedAuthUser {
  role: Role;
  deactivatedAt: Date | null;
  memberships: { organisationId: string; role: MembershipRole }[];
}

/**
 * Time-bounded in-memory cache for the per-request user lookup
 * the {@link AuthGuard} does on every authenticated request.
 *
 * # Why this exists
 *
 * The guard previously ran two sequential reads (`user` + every
 * `organisation_membership` row) on every request — the comment
 * on `AuthGuard` even called it out as a known bottleneck. Under
 * any non-trivial load, that's two round-trips and a small
 * scan per request on rows that almost never change for a given
 * user.
 *
 * Caching the tuple removes both round-trips on a cache hit
 * (better-auth's session lookup is the only remaining DB hit
 * on a hot path). The TTL keeps the staleness window predictable:
 * a "removed from org" propagates within `TTL_MS` seconds in the
 * worst case, which is acceptable for membership-driven access
 * control. Outside that window, mutations call
 * {@link invalidate} explicitly so the user sees the change
 * immediately.
 *
 * # Bounded size
 *
 * The cache holds at most {@link MAX_ENTRIES} users — a small
 * single-process LRU. JS `Map` preserves insertion order, so on
 * `set` we delete-then-re-insert to push the entry to the back of
 * the iteration order, and on overflow we evict whichever entry
 * was front-most (the least-recently-set). The cap prevents
 * unbounded growth without making the cache itself a target for
 * memory pressure.
 *
 * # Why not Redis
 *
 * Single-process is fine here: each backend instance has its own
 * cache; a user request hitting one instance benefits from prior
 * hits on the same instance only. Cross-instance staleness is
 * bounded by the same TTL — no distributed-invalidation protocol
 * needed. If we deploy a many-instance backend later and the per-
 * instance hit rate drops, we can layer Redis at the service
 * interface without changing the guard.
 */
@Injectable()
export class AuthUserCache {
  /** Entries older than this are re-loaded on next read. */
  private static readonly TTL_MS = 30_000;
  /** Hard cap on entry count. Front-most entries are evicted on overflow. */
  private static readonly MAX_ENTRIES = 10_000;

  private readonly store = new Map<string, { value: CachedAuthUser; expiresAt: number }>();

  /**
   * Returns the cached entry for `userId` if present and unexpired,
   * else invokes `load()`, caches the result, and returns it.
   * `load()` is responsible for all the actual DB I/O — the cache
   * is dumb on purpose.
   */
  async getOrLoad(
    userId: string,
    load: () => Promise<CachedAuthUser>,
    now: number = Date.now(),
  ): Promise<CachedAuthUser> {
    const existing = this.store.get(userId);
    if (existing !== undefined && existing.expiresAt > now) {
      // LRU touch: move to the back so it survives eviction longer.
      this.store.delete(userId);
      this.store.set(userId, existing);
      return existing.value;
    }
    if (existing !== undefined) {
      // Expired — drop before reload so a concurrent invalidate during
      // the load window doesn't race against the stale entry.
      this.store.delete(userId);
    }
    const value = await load();
    this.set(userId, value, now);
    return value;
  }

  /**
   * Evict the cached entry for `userId`. Called from mutation
   * paths that change a user's role / deactivation / membership
   * set so the next authenticated request sees the new state
   * immediately instead of waiting for TTL.
   */
  invalidate(userId: string): void {
    this.store.delete(userId);
  }

  /** Test-only: flush the entire cache (useful between test cases). */
  clear(): void {
    this.store.clear();
  }

  /** Test-only: current entry count, for asserting LRU bounds. */
  size(): number {
    return this.store.size;
  }

  private set(userId: string, value: CachedAuthUser, now: number): void {
    if (this.store.size >= AuthUserCache.MAX_ENTRIES) {
      // Drop the oldest entry. `keys()` iterates in insertion order
      // and the first key is the front of the LRU.
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(userId, { value, expiresAt: now + AuthUserCache.TTL_MS });
  }
}
