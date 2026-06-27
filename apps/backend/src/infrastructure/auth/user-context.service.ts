import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import { type AppAbility } from '../ability/ability.types.js';

import { type AuthenticatedUser } from './auth.types.js';

/**
 * Per-request bag that lives in `AsyncLocalStorage`. The user is
 * always known (the AuthGuard fills it on entry); the ability is
 * built lazily the first time a downstream service asks for it.
 */
interface UserContextBag {
  user: AuthenticatedUser;
  ability: AppAbility | null;
}

/**
 * Request-scoped storage for the authenticated user and (lazily)
 * their CASL ability, backed by Node's `AsyncLocalStorage`.
 *
 * # Why this exists
 *
 * Before this service, every row-level write check inside a service
 * (`TechniqueService.assertCanManage`, `PatternService.assertCanManage`,
 * etc.) called `AbilityFactory.createForUser(actor)` — iterating 14
 * rule contributors and building a fresh `AppAbility` every time. On
 * a single request that touched multiple row-level checks the ability
 * was rebuilt N times. None of those rebuilds were free: each ran
 * the contributor loop, allocated rule lists, and rebuilt the
 * MongoDB-style condition matcher.
 *
 * UserContextService caches the ability for the lifetime of one
 * request. AbilityFactory's new `forCurrentRequest()` method reads
 * the cache through this service; first call builds, subsequent calls
 * return the cached instance.
 *
 * # Why AsyncLocalStorage and not `Scope.REQUEST`
 *
 * NestJS request-scoped providers cause every dependent to also
 * become request-scoped — which would force AuthGuard itself
 * (currently a singleton) into a per-request lifecycle. That
 * re-triggers AuthGuard's two DB queries (user reload + memberships)
 * each time a request-scoped dependent is instantiated, and the
 * cost cascades through the dependency graph. `AsyncLocalStorage`
 * keeps everything singleton-scoped while still giving per-request
 * isolation, with no DI churn.
 *
 * # Lifecycle
 *
 * The AuthGuard calls {@link enter} once after it has hydrated
 * `req.user`. The store binds to the current async continuation so
 * the rest of the request lifecycle (interceptors, pipes, the
 * handler, any service it calls into) sees the same bag. Concurrent
 * requests get separate stores by virtue of separate async chains.
 */
@Injectable()
export class UserContextService {
  private readonly storage = new AsyncLocalStorage<UserContextBag>();

  /**
   * Test-only fallback bag. Vitest runs each `it` body in its own
   * async resource, so an `enterWith` call inside `beforeEach` does
   * NOT propagate to the test body — they share a parent process
   * but separate async chains. For specs we provide a synchronous
   * fallback that mirrors what the AuthGuard would bind on a real
   * request. The fallback is checked AFTER the async store so
   * production behaviour (real requests with ALS-bound context) is
   * unaffected — it only kicks in when the store is empty.
   *
   * Set via {@link setForTesting} in `beforeEach`; cleared
   * automatically per test file when the spec's worker process
   * exits. Never used outside the test suite.
   */
  private testFallback: UserContextBag | null = null;

  /**
   * Bind a context bag to the rest of the current async chain.
   * Called from {@link AuthGuard.canActivate} after `req.user` is
   * known. `enterWith` is the right primitive here (rather than
   * `run`) because the guard is itself the entry point — there's no
   * outer callback to wrap.
   */
  enter(user: AuthenticatedUser): void {
    this.storage.enterWith({ user, ability: null });
  }

  /**
   * Synchronous run-block variant — for tests and for the rare
   * non-guard-driven call site (e.g. a cron-style script that
   * impersonates a user). Production request paths use {@link enter}.
   */
  run<T>(user: AuthenticatedUser, fn: () => T): T {
    return this.storage.run({ user, ability: null }, fn);
  }

  /**
   * Throws when called outside a bound context. Misuse should be
   * loud — a silent `null` return would hide a serious leak (running
   * service code with no actor) far more dangerous than the symptom
   * of a thrown error.
   */
  getUser(): AuthenticatedUser {
    const bag = this.activeBag();
    if (bag === null) {
      throw new Error(
        '[UserContextService] No request context bound. ' +
          'Either the AuthGuard did not run, or this code path is being invoked ' +
          'outside an HTTP request lifecycle. For non-HTTP scripts, wrap the ' +
          'call site in `userContext.run(actor, () => ...)`.',
      );
    }
    return bag.user;
  }

  /** Cache read used by `AbilityFactory.forCurrentRequest`. */
  getCachedAbility(): AppAbility | null {
    return this.activeBag()?.ability ?? null;
  }

  /** Cache write used by `AbilityFactory.forCurrentRequest`. */
  setCachedAbility(ability: AppAbility): void {
    const bag = this.activeBag();
    if (bag === null) {
      throw new Error(
        '[UserContextService] Cannot cache ability outside a request context.',
      );
    }
    bag.ability = ability;
  }

  /**
   * Spec-only escape hatch. See the docstring on `testFallback` for
   * why this exists. Never call from production code paths.
   */
  setForTesting(user: AuthenticatedUser): void {
    this.testFallback = { user, ability: null };
  }

  /**
   * Returns the active bag, preferring the ALS store (production
   * path) and falling through to the test fallback when the store
   * is empty.
   */
  private activeBag(): UserContextBag | null {
    return this.storage.getStore() ?? this.testFallback;
  }
}
