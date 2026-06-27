import { describe, expect, it, vi } from 'vitest';

import {
  type AppAbility,
  type AppSubjectName,
} from '../ability/ability.types.js';
import { type AuthenticatedUser } from './auth.types.js';

import { UserContextService } from './user-context.service.js';

/**
 * Drives the production behaviour of `UserContextService` — the
 * AsyncLocalStorage path used by the AuthGuard at request time.
 * The spec-only `setForTesting` fallback is covered separately at
 * the bottom.
 */

function makeUser(id = 'u-1'): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    emailVerified: true,
    name: null,
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
  };
}

function fakeAbility(): AppAbility {
  // Smallest object shaped enough to satisfy the AppAbility type for
  // identity checks. The cache invariant we test is "the same
  // instance is returned twice" — its method surface isn't called.
  return { can: vi.fn() } as unknown as AppAbility;
}
void ({} as AppSubjectName); // tame the unused-import warning if any

describe('UserContextService — request-scoped storage (production path)', () => {
  it('makes the user visible to code running inside `run()`', () => {
    const svc = new UserContextService();
    const u = makeUser('alice');

    const seen = svc.run(u, () => svc.getUser());

    expect(seen).toBe(u);
  });

  it('throws when accessed outside a request context', () => {
    const svc = new UserContextService();
    expect(() => svc.getUser()).toThrow(/No request context bound/);
  });

  it('returns null for getCachedAbility when no ability has been cached yet', () => {
    const svc = new UserContextService();
    svc.run(makeUser(), () => {
      expect(svc.getCachedAbility()).toBeNull();
    });
  });

  it('caches an ability for the lifetime of one request', () => {
    const svc = new UserContextService();
    const ability = fakeAbility();

    const sameAcrossReads = svc.run(makeUser(), () => {
      svc.setCachedAbility(ability);
      const first = svc.getCachedAbility();
      const second = svc.getCachedAbility();
      return first === second && first === ability;
    });

    expect(sameAcrossReads).toBe(true);
  });

  it('isolates the cached ability between separate run() blocks', () => {
    const svc = new UserContextService();
    const ability1 = fakeAbility();
    const ability2 = fakeAbility();

    const r1 = svc.run(makeUser('alice'), () => {
      svc.setCachedAbility(ability1);
      return svc.getCachedAbility();
    });
    const r2 = svc.run(makeUser('bob'), () => {
      // A fresh run() must NOT see the previous run's cache.
      const beforeSet = svc.getCachedAbility();
      svc.setCachedAbility(ability2);
      return { beforeSet, afterSet: svc.getCachedAbility() };
    });

    expect(r1).toBe(ability1);
    expect(r2.beforeSet).toBeNull();
    expect(r2.afterSet).toBe(ability2);
    expect(r2.afterSet).not.toBe(r1);
  });

  it('throws when setCachedAbility is called outside a request', () => {
    const svc = new UserContextService();
    expect(() => svc.setCachedAbility(fakeAbility())).toThrow(
      /outside a request context/,
    );
  });

  it('propagates the bound context through async awaits', async () => {
    const svc = new UserContextService();
    const u = makeUser('alice');

    const seen = await svc.run(u, async () => {
      await Promise.resolve();
      await Promise.resolve();
      return svc.getUser();
    });

    expect(seen).toBe(u);
  });
});

describe('UserContextService — test-only fallback (`setForTesting`)', () => {
  it('makes the user visible without an `enter`/`run` wrapper', () => {
    const svc = new UserContextService();
    const u = makeUser('alice');

    svc.setForTesting(u);

    expect(svc.getUser()).toBe(u);
  });

  it('caches an ability across reads, mirroring the ALS contract', () => {
    const svc = new UserContextService();
    const ability = fakeAbility();

    svc.setForTesting(makeUser());
    svc.setCachedAbility(ability);

    expect(svc.getCachedAbility()).toBe(ability);
    expect(svc.getCachedAbility()).toBe(svc.getCachedAbility());
  });

  it('the ALS store takes precedence over the fallback when both are set', () => {
    const svc = new UserContextService();
    const fallbackUser = makeUser('fallback');
    const runUser = makeUser('run');

    svc.setForTesting(fallbackUser);

    const seen = svc.run(runUser, () => svc.getUser());

    expect(seen).toBe(runUser);
    // Outside the run() block, the fallback is back in effect.
    expect(svc.getUser()).toBe(fallbackUser);
  });
});
