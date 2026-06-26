# Architecture Review — taidohub

> Senior-engineer onboarding audit. No code changes; investigation only.
> See companion document [`architecture-refactor-plan.md`](./architecture-refactor-plan.md) for the chunked implementation plan.

---

## 1. The system as I found it

**Stack.** PNPM workspace monorepo with `apps/backend` (NestJS 11 + Drizzle 0.45 + postgres-js + better-auth + CASL), `apps/frontend` (React 19 + TanStack Router file-routing + TanStack Query v5 + Tailwind v4 + shadcn + i18next, organised by FSD), and `packages/contracts` (Zod 4 schemas + `zod-openapi` metadata + route paths) as the single source of truth for the HTTP boundary. Database is Supabase Postgres reached via PgBouncer (the dev env runs the session-mode pooler on port 5432).

**Module map — backend (19 modules).** Each typically has the 4-file shape: controller / service / repository / abilities, plus a spec. Notable exceptions: `belt-catalog` is triplicated into ranks / systems / titles sub-features (~10 nearly-identical files); `grading-history-projection` and `user-impersonation` have no repo (read-only and session-only respectively); `auth` has two controllers and no repo (better-auth owns the data). Naming is split between `*.abilities.ts` (7 modules) and `*.ability-rules.ts` (7 modules) — pure spelling drift.

**Module map — frontend.** Standard FSD layering with two coexisting entity shapes: `api/ + lib/hooks.ts + index.ts` (newer entities — feedback, technique, pattern, student) and `api/ + model/*.queries.ts + index.ts` (older — rank-history, profile, membership, belt-rank, etc.). Both work, but a reader has to know which lives where.

**Authenticated GET data flow.**

```
Express middleware
  → AuthGuard (2 DB queries — user reload + memberships)
  → AbilityGuard (rebuilds 14-rule ability tree)
  → FeatureFlagGuard (decorator-driven)
  → ZodValidationPipe
  → LoggingInterceptor (timing tap)
  → Controller
  → Service
  → Repository
  → DB
  → AllExceptionsFilter (on error)
  → LoggingInterceptor (response tap)
  → response
```

**Per-request DB budget for a single `GET /api/techniques` returning 5 rows: ~10 queries.** Two in AuthGuard (`user` reload + `organisation_membership` SELECT), one in classification resolution, one in the techniques list, then **one `listClassifications(rowId)` per row** plus a batched category lookup. The hydration loop at `apps/backend/src/modules/technique/technique.service.ts:108` is a textbook 1+N.

---

## 2. What's working — give credit first

These are real strengths to protect during any refactor:

- **Contract package as the HTTP boundary.** Zod 4 + `.meta()` for OpenAPI is genuinely good. All entity API files Zod-parse responses — not a single `as SomeType` bypass was found. Drift risk is structurally low: `role-enum-alignment.spec.ts` and `feedback-enum-alignment.spec.ts` block enum drift between DB pgEnum and contract schema at CI time.
- **Single error envelope.** `AllExceptionsFilter` normalises everything to `{ error: { code, message, details? } }`, frontend `httpClient` parses via the same schema, callers branch on `err.payload.code`. This is the model.
- **Real-DB e2e tests.** CI spins `postgres:16-alpine` as a service container, runs migrations, then `pnpm --filter backend test:e2e`. Not mocked. Expensive to set up and most teams never do it.
- **OpenAPI sync gate.** CI fails on `git diff --exit-code packages/contracts/openapi/` after a regen. Stale specs can't merge.
- **Index coverage where it counts.** Feedback schema has `thread_id_idx`, `parent_id_idx`, `author_id_idx`, `comment_created_at_idx` (the one the unread-count `WHERE created_at > last_read_at` predicate needs). Memberships has the right compound index. Today's mistakes are mostly in code, not schema.
- **DI architecture is real DI.** `buildBetterAuth` taking an injected `DrizzleDb` is the correct shape and demonstrates the team can do structural refactors when needed.

---

## 3. Critical problem areas, ranked

### 🔴 P0 — Hot path inefficiencies that compound under load

**P0.1 — AuthGuard runs 2 uncached DB queries on every authenticated request.**
`apps/backend/src/infrastructure/auth/auth.guard.ts:75–104` reloads the `user` row and the full `organisation_membership` list per request. No per-request memoisation, no Redis. At Supabase's 15-conn pooler cap and the current `max: 10` pool, **the auth path uses 2/10 of available slots per concurrent request** before any handler runs. One outage already attributed to this exact arithmetic.

**P0.2 — 1+N hydration in `technique` and `pattern` list endpoints.**
`apps/backend/src/modules/technique/technique.service.ts:108`: `Promise.all(rows.map(r => this.hydrate(r)))` calls `repo.listClassifications(row.id)` per row. With 50 techniques and 3 classifications each, that's ~51 connection-acquiring queries vs. 1 well-formed JOIN. Same pattern in `pattern.service`.

**P0.3 — `replaceClassifications` loops INSERT per ID.**
`apps/backend/src/modules/pattern/pattern.repository.ts:127–143` and the matching technique repo do `insert().onConflictDoUpdate()` per classification ID in a loop. For a technique with 10 categories, 10 INSERTs where one batch insert would do.

**P0.4 — `AbilityFactory.createForUser()` rebuilds the entire 14-rule ability tree on every row-level write check.**
Called inside 8+ services for instance-level `manage` checks (e.g., `apps/backend/src/modules/technique/technique.service.ts:267`). Not cached on `req`. Each rebuild iterates 14 contributors. Not a DB query, but a meaningful CPU pattern on hot paths.

### 🟠 P1 — Cross-cutting drift that gets worse with each new module

**P1.1 — CASL ability rules registered in two places, manually.**
`apps/backend/src/infrastructure/ability/ability.factory.ts:37–68` lists 14 contributors as `@Optional()` constructor params, then `apps/backend/src/infrastructure/ability/ability.module.ts` lists the same 14 as providers. Adding a module touches both. The apology comment about the lack of multi-bind support is the smell.

**P1.2 — Access control is split between CASL rules and procedural service guards.**
Feedback is the worst case: `FeedbackAbilityRules` grants every authenticated user `read|create|update|delete` on `FeedbackThread`, then the real 5-path access matrix (subject / sysadmin / club admin / linked instructor / grading examiner) lives in `FeedbackService.assertAccessForKey()`. CASL becomes a no-op decoration; reading the rules tells nothing about who can see what. Technique/pattern have a milder version.

**P1.3 — Admin pages duplicate the same list/new/view/edit quartet.**
`pages/admin/organisations/`, `pages/admin/patterns/`, `pages/admin/techniques/` all replicate the same code↔id URL-stable filter bridge, the same table shell, the same edit/delete confirmation pattern. ~12 page files where a generic `<ResourceAdminPage>` + per-resource config would do.

**P1.4 — Two entity shapes (`lib/hooks.ts` vs `model/*.queries.ts`).**
Both work. But anyone reading the frontend for the first time has to learn that some entities expose hooks from `lib/` and others from `model/`. No documented rule.

**P1.5 — `instructor-feedback` flag checked in 4 unrelated UI components.**
`FeedbackBadge`, `FeedbackThread`, `FeedbackThreadSheet`, `StudentDetailPage` each call `useFeatureFlag('instructor-feedback')` and return `null` when off. 4 places to remember to keep in sync; one missed check leaks the feature.

**P1.6 — Belt-catalog tripled.**
Three sub-features (ranks/systems/titles), each with controller + service + repo + spec. The shape is so similar the divergence is purely accidental. ~8 files of near-duplicate code.

**P1.7 — Naming drift in ability files.**
7 modules use `*.abilities.ts`, 7 use `*.ability-rules.ts`. Pure spelling.

### 🟡 P2 — Footguns that have already cost time

These have *already* burned hours — not theoretical:

**P2.1 — React Query cache survives sign-out.**
`apps/frontend/src/widgets/appsidebar/ui/NavUser.tsx` calls `signOut()` then navigates; does **not** call `queryClient.clear()` or invalidate `['me']`. With `useMyMembershipsQuery` set to `staleTime: 5 * 60 * 1000`, the next user who signs in within the window can see the previous user's memberships briefly (observed in this session as the "sidebar Students link hidden" race).

**P2.2 — TanStack flat-routing parent-as-component bug pattern.**
Recently fixed for `/admin/<resource>/$id` and `/students/$userId`: a parent route file is a component (not an Outlet layout), so child routes (`$id/edit`) silently never mount. Fixed per occurrence by splitting parent → Outlet layout + `index.tsx`. Will recur every time someone adds a new nested route and forgets the pattern. No lint rule guards it.

**P2.3 — `db.execute(sql\`…\`)` bypasses Drizzle's column type coercion.**
Already bit us today on the inbox query: `last_activity_at` came back as a string, not a Date; service called `.toISOString()` and crashed. A comment documents it on the row interface, but the trap is invisible at call sites.

**P2.4 — Backend errors are swallowed at the global filter.**
`AllExceptionsFilter` logs the query for a `DrizzleQueryError` but not the underlying Postgres `cause` ("relation does not exist"). First inbox 500 today was diagnosed only after reading the Drizzle source. Frontend-side, `FeedbackBadge` rendered the empty state on query error rather than surfacing it (fixed mid-session).

**P2.5 — Two connection pools competing against a 15-conn Supabase cap.**
Fixed last week, but the architectural lesson — *shared DB infrastructure must be a singleton enforced by DI, not constructible from a factory* — isn't encoded anywhere. The same shape could re-emerge if a seed or migration script instantiates a fresh Drizzle client alongside the server.

### 🟢 P3 — Lower-priority but worth flagging

- **No request-scoped context**: `req.user` and the ability built from it aren't memoised across guards / pipes / handler / nested service calls. NestJS `REQUEST` scope or AsyncLocalStorage would fix this.
- **No per-module DTO ↔ schema split** — services map DB rows to API types inline (`toApi` / `toThread` / `toComment`). Not bad, but no shared mapper utility means each module reinvents.
- **`SCAFFOLD_PROMPT.md`** sits at the repo root referencing files that have moved or been deleted. Dead docs.
- **Test ratio ~22% (backend) / ~23% (frontend)** by file count. Quality is good where it exists; coverage is uneven across modules.
- **Backend has no formal pagination contract for the new entities** (feedback inbox capped at 50 in SQL, but threads/comments lists are unbounded).

---

## 4. A target architecture for this app

Not a from-scratch rewrite. A direction for the next 12 months of features.

```
┌─────────────────────────────────────────────────────────────────┐
│  packages/contracts   (single HTTP boundary, single OpenAPI)    │
│  - Zod schemas + .meta() for OpenAPI                            │
│  - typed route paths                                            │
│  - error envelope                                               │
│  - ★ NEW: a shared `Paginated<T>` envelope                      │
└─────────────────────────────────────────────────────────────────┘
                ▲                                  ▲
                │                                  │
┌─────────────────────────────┐    ┌──────────────────────────────┐
│  apps/backend (NestJS)      │    │  apps/frontend (React)       │
│                             │    │                              │
│  infrastructure/            │    │  app/        (root, router)  │
│   - database (1 pool)       │    │  pages/      (routed views)  │
│   - auth (better-auth +     │    │  widgets/    (composed UI)   │
│     ★ request-scoped        │    │  features/   (verbs)         │
│       UserContext)          │    │  entities/   (one shape:     │
│   - ability (auto-discovery │    │                api + lib)    │
│     of contributors)        │    │  shared/     (ui, lib, api)  │
│                             │    │                              │
│  modules/                   │    │  ★ NEW: shared admin-page    │
│   - one shape per module    │    │     scaffold for list/new/   │
│     (controller / service / │    │     view/edit                │
│     repo / abilities /      │    │                              │
│     spec)                   │    │  ★ NEW: <FeatureGate>        │
│                             │    │     wrapper so per-component │
│  ★ NEW: thin domain layer   │    │     flag checks disappear    │
│     for cross-table         │    │                              │
│     procedural rules        │    │                              │
│     (Feedback access,       │    │                              │
│     grading examiner)       │    │                              │
└─────────────────────────────┘    └──────────────────────────────┘
                       ▲
                       │
              ┌────────────────┐
              │  Postgres      │
              │  (Supabase)    │
              │  - session 5432│
              │  - pgBouncer   │
              │    awareness   │
              │    in code     │
              └────────────────┘
```

Headline structural changes:

1. **Make `req.user` + the user's ability a request-scoped object.** Built once by AuthGuard, consumed everywhere via `@CurrentUser()` and a new `@CurrentAbility()`. No more `AbilityFactory.createForUser(actor)` calls scattered across 8 services.

2. **Auto-discover ability contributors via a `multi: true`-style provider token.** One place to add new modules, not two.

3. **Promote procedural cross-table access rules to a thin domain layer.** `FeedbackService.assertAccessForKey()` becomes `FeedbackAccessPolicy.canAccess(actor, thread)` — same logic, but unit-testable without spinning up the service tree, and reusable from the controller/guard layer when CASL conditions can't express it.

4. **Collapse `model/*.queries.ts` and `lib/hooks.ts` into one entity shape.** Pick `lib/hooks.ts`. Mechanical move.

5. **Build a `<ResourceAdminPage<T>>` scaffold** with slots for: list table column config, edit form schema, view detail renderer, audit footer. Repo-wide: collapses 12 page files into 3 config objects.

6. **Single `<FeatureGate code="instructor-feedback">` wrapper** that takes children + an optional fallback. Per-component `useFeatureFlag` calls move to one component.

7. **Standardise pagination via `Paginated<T> = { data: T[]; nextCursor: string | null }`** in `packages/contracts` and require all new list endpoints to use it. Backfill the unbounded ones.

8. **Add an `arch` rule that detects parent-as-component routes** in `app/router/routes/_app.*.tsx` to prevent recurrence of the route-mount bug.

---

## 5. Refactoring strategy — phased, with sequencing

Order matters: each phase builds so the next phase is cheap.

### Phase 1 — Stop the bleeding (1–2 weeks, 1 dev)

Highest leverage, lowest risk:

- **1.1** Wire `queryClient.clear()` into the sign-out flow. (P2.1)
- **1.2** Add a per-request `UserContext` via NestJS `REQUEST` scope or AsyncLocalStorage. (P0.4)
- **1.3** Replace the technique/pattern hydration loop with a single JOIN-based read. (P0.2)
- **1.4** Batch `replaceClassifications` into a single bulk operation. (P0.3)
- **1.5** Improve `AllExceptionsFilter` to log the `cause` chain on `DrizzleQueryError`. (P2.4)
- **1.6** Add an explicit pool-singleton assertion to the Drizzle client factory. (P2.5)

**Exit criterion**: hot-path GET latency drops measurably; the recently-debugged classes of bug are structurally prevented.

### Phase 2 — Architectural simplifications (3–6 weeks, 1–2 devs)

- **2.1** Build ability-contributor auto-discovery. (P1.1)
- **2.2** Introduce `FeedbackAccessPolicy` as a stand-alone class. (P1.2)
- **2.3** Build `<ResourceAdminPage<T>>` and migrate organisations. (P1.3)
- **2.4** Pick one entity shape (`lib/hooks.ts`) and mechanical-codemod the `model/`-based entities. (P1.4)
- **2.5** Build `<FeatureGate code="...">` wrapper. (P1.5)
- **2.6** Rename `*.ability-rules.ts` → `*.abilities.ts` repo-wide. (P1.7)

**Exit criterion**: a new admin module is 1 backend feature folder + 1 entity folder + 1 `<ResourceAdminPage>` config + 1 router file. Today it's ~15 files.

### Phase 3 — Production-grade hardening (ongoing, woven into feature work)

- **3.1** Standardise `Paginated<T>` in contracts. (P3, scale)
- **3.2** Add per-request caching for AuthGuard memberships. (P0.1)
- **3.3** Add an `arch` rule for the parent-as-component route bug. (P2.2)
- **3.4** Standardise `db.execute` Date coercion via a `coerceRow<T>()` helper. (P2.3)
- **3.5** Collapse `belt-catalog` triplication into a generic `LookupTableModule<T>`. (P1.6)
- **3.6** Delete `SCAFFOLD_PROMPT.md` (or move to `docs/history/`). (P3)
- **3.7** Backfill testing for under-covered modules.

---

## 6. TL;DR

The codebase has a strong typed boundary (contracts + Zod + OpenAPI sync), a real-DB e2e suite, and a sensible NestJS+Drizzle backbone — it's not a tear-down. The pain is in three recurring shapes:

1. **Hot paths do too much work per request** — AuthGuard DB cost, hydration 1+N, per-call ability rebuilds.
2. **Cross-cutting concerns are registered in too many places** — CASL contributors, feature flag checks, two entity shapes, mixed naming.
3. **A few invisible footguns** that have already cost hours and will keep doing so until structurally prevented (cache-on-signout, parent-as-component routes, `db.execute` Date coercion, swallowed Drizzle error causes).

Two-week focused refactor on Phase 1 + selected Phase 2 chunks lifts the codebase from "growing pains" to "production-grade for the next 12 months of features." No rewrite needed; the bones are good.
