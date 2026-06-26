# Architecture Refactor — Implementation Plan

> Companion to [`architecture-review.md`](./architecture-review.md). Reading the review first is assumed; this document is the work breakdown only.

---

## Ground rules

1. **Every chunk lands on its own branch.** Do **not** push refactor work directly to `main`. Branch naming: `refactor/<phase>-<chunk-id>-<short-slug>` (e.g. `refactor/p1-1-queryclient-clear-on-signout`).
2. **One PR per chunk.** Each chunk in this document is sized to be a single review-able PR (typical target: 1–3 days of work, ≤500 lines diff). If a chunk grows past that, split it.
3. **Stay green at every chunk boundary.** `pnpm turbo run lint typecheck arch build test` must pass on the branch tip before merging. CI's `backend-e2e` and `openapi-sync` jobs included.
4. **No functional regressions.** Each chunk is structural / performance / hygiene — none of them change product behaviour by design. If a chunk *has* to change behaviour (e.g. an endpoint shape) it's noted explicitly under "Behaviour change" with a migration path.
5. **Merge order is not always sequential.** Chunks are tagged `requires:` to show real dependencies; anything without a `requires:` tag can be picked up in parallel.
6. **Tracking.** Open one umbrella issue (`refactor: architecture review followups`) and a sub-issue per chunk. The umbrella links the review document; each sub-issue copies the chunk spec verbatim.

---

## Phase 1 — Stop the bleeding

> **Why first.** Each of these structurally prevents a class of bug that has already cost time, or removes a known performance hot-spot. They're small and safe.

### Chunk 1.1 — `queryClient.clear()` on sign-out

- **Branch:** `refactor/p1-1-queryclient-clear-on-signout`
- **Problem (review § P2.1):** React Query cache survives sign-out; the next user who signs in within the 5-min `staleTime` window can see the previous user's membership data.
- **Scope:**
  - `apps/frontend/src/features/auth-by-email/api/auth.api.ts` — extend `signOut()` to call `queryClient.clear()` (or accept the client as a parameter via a new `useSignOut()` hook).
  - `apps/frontend/src/widgets/appsidebar/ui/NavUser.tsx` — call the new hook.
- **Effort:** ½ day.
- **Acceptance criteria:**
  - After sign-out, `queryClient` has no cached entries.
  - Signing in as a second user shows that user's memberships immediately (no 5-min stale-cache window).
  - Add a unit test (or extend the existing `NavUser` test) that asserts the clear was called.
- **Risk:** Very low. Affects only the post-sign-out state.
- **Behaviour change:** None visible to logged-in users.
- **Requires:** —

### Chunk 1.2 — AllExceptionsFilter logs the `cause` chain

- **Branch:** `refactor/p1-2-exception-filter-cause-chain`
- **Problem (review § P2.4):** The global exception filter logs a query for a `DrizzleQueryError` but not the underlying Postgres `cause` ("relation does not exist"). The first inbox 500 in this session was diagnosed only after reading library source.
- **Scope:**
  - `apps/backend/src/common/filters/all-exceptions.filter.ts` — when serialising a 5xx for logs, walk `err.cause` recursively and include each layer's `name`, `message`, and (if available) `code`.
  - Keep the response envelope unchanged (generic `INTERNAL` for clients).
- **Effort:** ½ day.
- **Acceptance criteria:**
  - Provoking a malformed SQL query in a test logs the inner Postgres error message.
  - The HTTP response shape is unchanged (envelope schema test still passes).
- **Risk:** Very low. Server-log change only.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 1.3 — Pool-singleton assertion in the Drizzle client factory

- **Branch:** `refactor/p1-3-drizzle-pool-singleton`
- **Problem (review § P2.5):** Two competing postgres-js pools against the 15-conn Supabase cap caused a production outage. The DI fix shipped, but a future seed/migration script could re-introduce a second pool.
- **Scope:**
  - `apps/backend/src/infrastructure/database/client.ts` — track per-`DATABASE_URL` instantiations in a module-level `WeakSet` (or a counter); throw on the second instantiation outside a test harness sentinel.
  - Allow opt-out for the seed CLI: an explicit `allowMultiple: true` flag or a `process.env.SEED_CLIENT` check, documented inline.
- **Effort:** ½ day.
- **Acceptance criteria:**
  - Running the backend boots normally.
  - Adding a synthetic second `createDrizzleClient(env.DATABASE_URL)` call in a test throws with a clear message.
  - Existing seed script still works.
- **Risk:** Low. The seed-script opt-out path is the one to test carefully.
- **Behaviour change:** None at runtime. Surfaces an error during dev iteration.
- **Requires:** —

### Chunk 1.4 — Batch `replaceClassifications` writes

- **Branch:** `refactor/p1-4-batch-replace-classifications`
- **Problem (review § P0.3):** Technique and pattern repos loop `insert().onConflictDoUpdate()` per classification ID. For 10 categories that's 10 round-trips where 1 batch insert + 1 delete-not-in would do.
- **Scope:**
  - `apps/backend/src/modules/technique/technique.repository.ts:127–143`
  - `apps/backend/src/modules/pattern/pattern.repository.ts:127–143`
  - Replace each loop with a single bulk insert (using `insert().values(rows)` + `onConflictDoUpdate`) and a single `delete().where(and(eq(joinTable.parentId, id), notInArray(joinTable.classificationId, ids)))`.
- **Effort:** 1 day (incl. tests).
- **Acceptance criteria:**
  - Existing technique/pattern service specs pass.
  - New repo-level spec asserts the row count after a 10-ID replace matches expectation.
  - `EXPLAIN ANALYZE` (in a comment in the spec) shows the new path is 2 round-trips not N.
- **Risk:** Medium. Mutation path; needs careful tx wrapping (already inside service tx).
- **Behaviour change:** None.
- **Requires:** —

### Chunk 1.5 — Replace technique hydration 1+N with a JOIN-based read

- **Branch:** `refactor/p1-5-technique-list-join`
- **Problem (review § P0.2):** `TechniqueService.list()` runs `Promise.all(rows.map(r => hydrate(r)))`; each `hydrate()` calls `listClassifications(rowId)` — classic 1+N.
- **Scope:**
  - `apps/backend/src/modules/technique/technique.repository.ts` — add `listWithClassifications(filter)` that returns rows joined with their classification IDs (one query, GROUP BY or `json_agg`).
  - `apps/backend/src/modules/technique/technique.service.ts:64–109` — call the new repo method; drop the per-row `hydrate` loop.
  - Keep the existing `findOne` path for now (it's a single-row read; not the hot path).
- **Effort:** 2 days.
- **Acceptance criteria:**
  - `GET /api/techniques` response shape is identical to before.
  - Existing service + e2e tests pass.
  - New repo spec records the query count: 1 (not N+1).
  - p95 latency measured before/after in a local benchmark; ≥ 5× improvement on a list of 50.
- **Risk:** Medium. Aggregation shape needs Zod schema parity.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 1.6 — Same JOIN-based read for patterns

- **Branch:** `refactor/p1-6-pattern-list-join`
- **Problem:** Identical to 1.5, applied to patterns.
- **Scope:**
  - `apps/backend/src/modules/pattern/pattern.repository.ts`
  - `apps/backend/src/modules/pattern/pattern.service.ts`
- **Effort:** 1 day (the work pattern is established by 1.5).
- **Acceptance criteria:** Same as 1.5.
- **Risk:** Medium-low (lower than 1.5 because the pattern is now known).
- **Behaviour change:** None.
- **Requires:** 1.5 (so the pattern is set and we can reuse the test approach).

### Chunk 1.7 — Request-scoped UserContext + `@CurrentAbility()`

- **Branch:** `refactor/p1-7-request-scoped-user-context`
- **Problem (review § P0.4):** `AbilityFactory.createForUser(actor)` is called inside 8+ services on every row-level write check, rebuilding the entire 14-rule ability tree each time.
- **Scope:**
  - `apps/backend/src/infrastructure/auth/` — add a `UserContextService` backed by `AsyncLocalStorage` (preferred over `Scope.REQUEST` to avoid AuthGuard becoming request-scoped, which would re-trigger DB hydration for every guard call).
  - `apps/backend/src/infrastructure/auth/auth.guard.ts` — populate the context once per request after hydration.
  - `apps/backend/src/infrastructure/ability/` — add a `@CurrentAbility()` parameter decorator that reads from the context and lazily builds + memoises the ability for the request.
  - Migrate **3 highest-traffic services** (`TechniqueService`, `PatternService`, `OrganisationsService`) to use `@CurrentAbility()` instead of calling `AbilityFactory.createForUser(actor)` directly. Leave the rest for Phase 2.
- **Effort:** 3 days (foundation + 3 migrations).
- **Acceptance criteria:**
  - All existing service specs pass.
  - New context spec: asserts the same ability instance is returned for two reads within the same request, and a different instance across requests.
  - A regression test demonstrates that on a request that doesn't trigger an ability check, no ability is built (lazy contract).
- **Risk:** Medium. AsyncLocalStorage misuse can leak context across requests if not initialised correctly — the spec needs to assert isolation.
- **Behaviour change:** None.
- **Requires:** —

### Phase 1 exit criteria

All six chunks merged to `main`. Snapshot before/after:
- AuthGuard hot path: 2 DB queries → unchanged at the guard, but ability rebuilds in services drop to 1 per request.
- Techniques list p95: measurably lower (track before/after numbers in the PR).
- Three structural footguns prevented at the type / lint / runtime layer.

---

## Phase 2 — Architectural simplifications

> **Why second.** With Phase 1 fixing hot paths, Phase 2 is about reducing the per-feature cost of adding new modules and removing accidental duplication.

### Chunk 2.1 — Ability-contributor auto-discovery

- **Branch:** `refactor/p2-1-ability-auto-discovery`
- **Problem (review § P1.1):** 14 contributors listed manually in `AbilityFactory` constructor + 14 in `AbilityModule` providers. Two places to update per new module.
- **Scope:**
  - Add an `@AbilityContributor()` decorator that marks a class as a CASL rules provider.
  - Add a discovery service (NestJS `DiscoveryService` from `@nestjs/core`) that collects them on `onApplicationBootstrap`.
  - `AbilityFactory` consumes the discovered list instead of constructor args.
  - Migrate the 14 existing contributors (decorator on each + drop them from the factory constructor).
- **Effort:** 3 days.
- **Acceptance criteria:**
  - Adding a hypothetical 15th contributor requires only the decorator + module provider — no edit to `AbilityFactory`.
  - All existing ability specs pass.
  - A new test asserts that a contributor module that forgets the decorator is NOT picked up (and so its rules aren't silently applied).
- **Risk:** Medium. Discovery timing can interact with circular-dependency edges.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 2.2 — `FeedbackAccessPolicy` as a stand-alone class

- **Branch:** `refactor/p2-2-feedback-access-policy`
- **Problem (review § P1.2):** The 5-path access matrix lives inside `FeedbackService.assertAccessForKey()`. CASL only grants the broad "any user may interact" rule. The real rules are invisible to anyone reading `FeedbackAbilityRules`.
- **Scope:**
  - New `apps/backend/src/modules/feedback/feedback.access-policy.ts` — extract `canAccess(actor, thread): Promise<boolean>` and `assertAccess(actor, thread): Promise<void>`.
  - `FeedbackService` consumes the policy.
  - The existing 17 acceptance tests move to `feedback.access-policy.spec.ts` and are reorganised by access path.
- **Effort:** 2 days.
- **Acceptance criteria:**
  - All 17 acceptance tests still pass, now from the policy spec.
  - The policy class has no NestJS-specific imports (besides `@Injectable`) — directly unit-testable.
- **Risk:** Low. Refactor, not a behaviour change.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 2.3 — `<ResourceAdminPage<T>>` scaffold + organisations migration

- **Branch:** `refactor/p2-3-resource-admin-scaffold-organisations`
- **Problem (review § P1.3):** `pages/admin/organisations/`, `pages/admin/patterns/`, `pages/admin/techniques/` replicate the same list/new/view/edit quartet — ~12 page files of accidental duplication.
- **Scope:**
  - New `apps/frontend/src/features/resource-admin/` — a generic component taking config: `{ list: {columns, filters}, edit: {schema, form}, view: {render, auditFooter}, routes: {list, new, view, edit} }`.
  - Migrate **organisations** as the proof. Delete the per-page boilerplate; replace with a single config + thin route shells.
- **Effort:** 5 days (foundation is most of it).
- **Acceptance criteria:**
  - Organisations admin behaves identically to before (URL filters, edit submit, audit footer, etc.).
  - Existing organisations-page tests pass.
  - The scaffold is documented in `docs/resource-admin-pattern.md` with a worked example.
- **Risk:** Medium. UI scaffolds can over-abstract; resist the temptation to support every variant.
- **Behaviour change:** None visible.
- **Requires:** —

### Chunk 2.4 — Migrate techniques admin to the scaffold

- **Branch:** `refactor/p2-4-resource-admin-techniques`
- **Scope:** Same scaffold, applied to `pages/admin/techniques/`.
- **Effort:** 2 days (scaffold is in place).
- **Acceptance criteria:** Functionally identical; tests pass.
- **Risk:** Low (template now exists).
- **Behaviour change:** None.
- **Requires:** 2.3.

### Chunk 2.5 — Migrate patterns admin to the scaffold

- **Branch:** `refactor/p2-5-resource-admin-patterns`
- **Scope:** Same scaffold, applied to `pages/admin/patterns/`.
- **Effort:** 2 days.
- **Acceptance criteria:** Same as 2.4.
- **Requires:** 2.3.

### Chunk 2.6 — Consolidate entity shape (drop `model/*.queries.ts`)

- **Branch:** `refactor/p2-6-entity-shape-codemod`
- **Problem (review § P1.4):** Some entities expose hooks from `lib/hooks.ts`, others from `model/*.queries.ts`. Pure inconsistency.
- **Scope:** Mechanical codemod across `apps/frontend/src/entities/`:
  - For each entity with `model/`: move queries → `lib/hooks.ts`, update barrel exports.
  - Affected entities: `rank-history`, `profile`, `belt-rank`, `belt-system`, `shogo-title`, `user`, `membership`, `audit-log` (cross-check from the audit).
- **Effort:** 2 days (mostly find/replace + import-fix).
- **Acceptance criteria:**
  - Every entity exposes hooks from `lib/hooks.ts`.
  - All consumers' imports updated; lint + typecheck green.
  - `docs/frontend-conventions.md` adds an "entity shape" section.
- **Risk:** Low; mostly mechanical.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 2.7 — `<FeatureGate code="...">` wrapper

- **Branch:** `refactor/p2-7-feature-gate`
- **Problem (review § P1.5):** `useFeatureFlag('instructor-feedback')` checked in 4 separate components.
- **Scope:**
  - `apps/frontend/src/shared/lib/feature-flags/FeatureGate.tsx` — wraps `useFeatureFlag`; renders children or fallback.
  - Replace the 4 `useFeatureFlag('instructor-feedback')` call sites with `<FeatureGate code="instructor-feedback">...</FeatureGate>` or the equivalent route-level guard.
- **Effort:** 1 day.
- **Acceptance criteria:**
  - Feature behaviour with flag on/off unchanged.
  - All 4 `useFeatureFlag('instructor-feedback')` sites removed or replaced.
- **Risk:** Very low.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 2.8 — Rename `*.ability-rules.ts` → `*.abilities.ts`

- **Branch:** `refactor/p2-8-abilities-naming`
- **Problem (review § P1.7):** 7 modules use one name, 7 the other. Pure spelling drift.
- **Scope:** Mechanical rename across the 7 outlier modules + update imports.
- **Effort:** ½ day.
- **Acceptance criteria:** `git ls-files | grep -E 'ability-rules' = empty`. Typecheck + lint green.
- **Risk:** Negligible.
- **Behaviour change:** None.
- **Requires:** Best done after 2.1 to avoid rebasing the discovery wiring.

### Phase 2 exit criteria

A new admin entity (CRUD + URL filters + edit form + audit footer) ships in 1 day of work, in ~4 files (entity, scaffold config, router shell, e2e test). A new module that contributes CASL rules is one decorator + one provider entry — no `AbilityFactory` edit. The frontend has one entity shape.

---

## Phase 3 — Production-grade hardening

> **Why third.** Phase 1 + 2 fix what's broken or duplicated. Phase 3 is the "next 12 months of features" investment — woven into feature work rather than a dedicated sprint.

### Chunk 3.1 — `Paginated<T>` contract + migrate one endpoint

- **Branch:** `refactor/p3-1-paginated-contract`
- **Scope:** Add a `Paginated<T>` Zod helper to `packages/contracts`, migrate the inbox endpoint (already capped at 50 internally) as the first consumer, and document the convention.
- **Effort:** 2 days.
- **Acceptance criteria:** Inbox endpoint shape changes from `{ data: T[] }` to `{ data: T[]; nextCursor: string | null }`; frontend reads the new field but ignores `nextCursor` for now.
- **Behaviour change:** Yes, but additive. Backwards-compatible for clients reading only `data`.
- **Requires:** —

### Chunk 3.2 — AuthGuard memberships caching

- **Branch:** `refactor/p3-2-authguard-membership-cache`
- **Problem (review § P0.1):** AuthGuard runs 2 DB queries per request.
- **Scope:** Per-process LRU cache keyed by `userId` with 5s TTL; invalidate on membership mutations via a service-level event. Conservative TTL keeps role/membership changes visible quickly while collapsing a burst of requests.
- **Effort:** 3 days (cache + invalidation wiring + a load test demonstrating the win).
- **Acceptance criteria:** Burst of 50 concurrent requests for the same user does ≤ 5 DB queries (was 50).
- **Risk:** Medium. Stale cache after role change is the failure mode; invalidation testing is critical.
- **Behaviour change:** None visible to users.
- **Requires:** 1.7 (UserContext provides the natural cache key).

### Chunk 3.3 — `arch` rule against parent-as-component routes

- **Branch:** `refactor/p3-3-arch-route-mount-rule`
- **Scope:** Add a rule to the existing `pnpm arch` check that scans `apps/frontend/src/app/router/routes/_app.*.tsx` and fails if a parent route (a file whose `path` is a prefix of another route file's `path`) has a component that is anything other than `<Outlet />` or a tiny layout wrapper.
- **Effort:** 2 days.
- **Acceptance criteria:** Adding a regression test route deliberately violating the rule fails CI.
- **Risk:** Low (rule is conservative; false positives can be allow-listed).
- **Behaviour change:** None at runtime; build-time gate.
- **Requires:** —

### Chunk 3.4 — `coerceRow<T>()` helper for `db.execute` reads

- **Branch:** `refactor/p3-4-coerce-row-helper`
- **Problem (review § P2.3):** `db.execute(sql\`...\`)` returns timestamps as strings; the inbox 500 today was exactly this.
- **Scope:** Generic helper `coerceRow<T extends Record<string, unknown>>(row, schema)` that takes a small column-type map (`{ last_activity_at: 'date' }`) and returns a typed row. Apply at the repo boundary for the 3 inbox queries; lint rule encourages it for new `db.execute` callers.
- **Effort:** 2 days.
- **Acceptance criteria:** No raw `.toISOString()` calls in services on `db.execute` rows.
- **Risk:** Low.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 3.5 — Generic `LookupTableModule` for belt-catalog

- **Branch:** `refactor/p3-5-lookup-table-module`
- **Problem (review § P1.6):** Belt-catalog tripled into ranks/systems/titles, ~8 nearly-identical files.
- **Scope:** Generic `LookupTableModule<T>` (CRUD over a single table, no business rules). Collapse the three sub-features into config objects.
- **Effort:** 4 days.
- **Acceptance criteria:** Identical API behaviour; 3 specs collapse to 1 generic spec + 3 fixture-driven runs.
- **Risk:** Medium (generics on the backend can over-abstract).
- **Behaviour change:** None.
- **Requires:** —

### Chunk 3.6 — Remove `SCAFFOLD_PROMPT.md`

- **Branch:** `refactor/p3-6-remove-scaffold-prompt`
- **Scope:** Delete `SCAFFOLD_PROMPT.md` (or move to `docs/history/scaffold-prompt.md` with a header noting it's historical).
- **Effort:** 15 minutes.
- **Acceptance criteria:** No remaining stale references in `README.md`.
- **Risk:** Negligible.
- **Behaviour change:** None.
- **Requires:** —

### Chunk 3.7 — Testing backfill (rolling)

- **Branch:** N/A — done module-by-module as part of feature work, not a single PR.
- **Scope:** Lift the under-covered modules (e.g. `belt-catalog`, `health`, `grading-history-projection`) to the same test density as `feedback` and `users`. Use the existing real-Postgres harness.
- **Effort:** 1 day per module (~10 total).
- **Acceptance criteria:** Per-module file-count test ratio ≥ 40%.
- **Risk:** None.
- **Behaviour change:** None.
- **Requires:** —

---

## Two-week starter sprint

If picking only what fits in 2 weeks for one senior engineer:

| Day  | Chunk | Notes                                                |
|------|-------|------------------------------------------------------|
| 1    | 1.1   | `queryClient.clear()` — half day.                    |
| 1    | 1.2   | Exception filter cause chain — half day.             |
| 2    | 1.3   | Pool-singleton assertion — half day.                 |
| 2    | 1.4   | Batch `replaceClassifications` — half day.           |
| 3–4  | 1.5   | Techniques list JOIN.                                |
| 5    | 1.6   | Patterns list JOIN.                                  |
| 6–8  | 1.7   | UserContext + `@CurrentAbility()` + 3 migrations.    |
| 9    | 2.7   | `<FeatureGate>` wrapper.                             |
| 9    | 2.8   | Abilities naming rename.                             |
| 10–14| 2.3   | `<ResourceAdminPage>` scaffold + organisations.      |

Exit deliverables:
- Two short ADRs in `docs/adr/`:
  - `0001-request-scoped-user-context.md`
  - `0002-resource-admin-scaffold.md`
- A "footguns we now structurally prevent" section added to the repo `README.md`.
- Measurable wins on the techniques/patterns list endpoints (p95 latency, query count) recorded in the PR descriptions.

---

## Tracking template

When opening sub-issues, copy this template per chunk:

```markdown
## Chunk <id> — <title>

**Branch:** `refactor/<phase>-<id>-<slug>`
**Effort:** <range>
**Requires:** <list of chunks or "—">

### Scope
<copy verbatim from this document>

### Acceptance criteria
- [ ] <each criterion as a checkbox>

### Risk
<as documented>

### Behaviour change
<as documented>

### Done when
- [ ] Branch pushed
- [ ] PR opened against `main`
- [ ] CI green (lint, typecheck, arch, build, test, backend-e2e, openapi-sync)
- [ ] Reviewed
- [ ] Merged
- [ ] Sub-issue closed
```
