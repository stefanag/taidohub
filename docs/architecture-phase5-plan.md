# Architecture Phase 5 — implementation plan

> **Status:** Drafted 2026-06-28, after Phase 4 closed out
> (`docs/architecture-followups-plan.md`).
>
> **Predecessors:**
> [`architecture-review.md`](./architecture-review.md) — the original
> senior-engineer audit (Phase 0).
> [`architecture-refactor-plan.md`](./architecture-refactor-plan.md) —
> the Phase 1–3 chunked refactor.
> [`architecture-followups-plan.md`](./architecture-followups-plan.md) —
> Phase 4 follow-ups.
> Read those for context on the patterns this plan reuses (per-chunk
> branch, PR-per-chunk, audit-then-verify-then-merge protocol).

## What this plan covers

Four substantive items the Phase 1–3 audit + Phase 4 work
deliberately deferred, each large enough to warrant its own
chunk track:

| Chunk | Scope                                                   | Effort       | Risk |
|-------|---------------------------------------------------------|--------------|------|
| 5.1   | `fsd/forbidden-imports` cleanup (rolling, 3–5 sub-PRs)  | 1–2 days     | Low  |
| 5.2   | BeltRanks → `LookupTableService` migration              | 1 day        | Low  |
| 5.3   | Organisations admin → tree-aware admin scaffold         | 3–4 days     | Medium |
| 5.4   | Frontend testing audit + rolling backfill               | rolling      | Low  |

## What this plan deliberately does NOT cover

- **Postgres-harness repository specs.** Tracked separately as
  an investigation in
  [`architecture-investigations.md`](./architecture-investigations.md) —
  the harness choice (testcontainers vs Supabase dev DB vs
  pg-mem vs other) needs discovery work before a concrete plan
  is worth writing. Once the investigation lands a decision,
  the resulting repo-spec chunks fold back in as Phase 5
  additions.

---

## Chunk 5.1 — `fsd/forbidden-imports` cleanup (rolling)

**Branch family:** `refactor/p5-1-<short-slug>` (one per sub-PR)
**Effort:** 1–2 days total, broken into 3–5 sub-PRs
**Risk:** Low — production-side imports, but each individual
  decision is small and reversible.
**Requires:** —

**Background.** Chunk 4.2 surfaced 5 production-side
`fsd/forbidden-imports` errors that Phase 4 deliberately left
out of scope (they aren't test-side; the barrel recipe doesn't
apply). Each error is one of:

  - **Entity importing a feature** — the architectural worst
    case (entities should not depend on features at all).
  - **Feature cross-importing another feature** — common
    pattern in the codebase; usually resolved with an explicit
    `steiger.config.js` override after deciding the cross-cut
    is genuine.

The 5 errors and the symbols they import:

| # | File                                                   | Imports                                       | Class             |
|---|--------------------------------------------------------|-----------------------------------------------|-------------------|
| 1 | `entities/rank-history/lib/hooks.ts`                   | `authClient` from `@/features/auth-by-email`  | Entity → feature  |
| 2 | `features/feedback-thread/ui/FeedbackComment.tsx`      | `useSession` from `@/features/auth-by-email`  | Feature × feature |
| 3 | `features/feedback-thread/ui/FeedbackThread.tsx`       | `useSession` from `@/features/auth-by-email`  | Feature × feature |
| 4 | `features/grading-timeline/ui/GradingTimelineEntry.tsx`| `FeedbackThreadSheet` from `@/features/feedback-thread` | Feature × feature |
| 5 | `features/org-membership-manager/ui/OrgMembershipManager.tsx` | `useSession` from `@/features/auth-by-email` | Feature × feature |

Three of the five (#2, #3, #5) want the same thing: "who is the
current authenticated user." That's `entities/me`'s job — it
already exists and exports membership state. The clean fix:
re-export `useSession` (and the `Session` type) from
`entities/me`, then point the three consumers there.

**Scope (sub-PR breakdown).**

### 5.1a — `entities/me.useSession` consolidation

  - Inspect `entities/me/index.ts` and confirm it has no existing
    `useSession` export that would collide.
  - Add `useSession` (and `Session` type) to the `entities/me`
    barrel as a re-export from `@/features/auth-by-email`.
    Re-exporting from a feature inside an entity is itself a
    `fsd/forbidden-imports` violation — silence it with a
    targeted override scoped to `entities/me/index.ts` only,
    with a comment explaining the public-surface compaction.
  - Migrate `FeedbackComment.tsx`, `FeedbackThread.tsx`,
    `OrgMembershipManager.tsx` to import `useSession` from
    `@/entities/me`.
  - Re-run `pnpm arch` — verify 3 errors disappear.
  - Frontend suite passes.

### 5.1b — Entity rank-history `authClient` isolation

  - Inspect `entities/rank-history/lib/hooks.ts` — what does
    `authClient` actually do at the call site? Most likely a
    `getSession()` refresh inside a `useMutation` `onSuccess`
    handler so the better-auth session store re-reads after a
    profile-affecting mutation.
  - Decide: **lift** the side-effect to the call sites (have
    each mutation expose its own `onSuccess` and let the page
    refresh sessions), OR **extract** the refresh helper to
    `shared/lib/` (it's a one-line wrapper around
    `authClient.getSession()`), OR **accept** with an override.
  - Whichever path: keep the architectural intent clear — the
    rank-history entity should not depend on the auth-by-email
    feature. If the override path wins, document explicitly why
    the cross-import is genuine and stable.

### 5.1c — `GradingTimelineEntry` × `FeedbackThreadSheet`

  - Inspect the composition. If `GradingTimelineEntry` is
    genuinely the right place to host a feedback sheet (the
    grading timeline UI displays threaded feedback inline), the
    cross-feature import is intent-correct.
  - Likely decision: **accept-with-override**. Document the
    composition rationale at the override block — same pattern
    as the `organisation-form → audit-log-table` cross-import
    that's already overridden.

**Acceptance criteria.**

- After every sub-PR: `pnpm arch` errors monotonically decrease;
  no new errors surface.
- After the last sub-PR: arch reports 0 `forbidden-imports`
  errors. The 22 `insignificant-slice` / `repetitive-naming`
  warnings remain unchanged — out of scope.
- Every sub-PR keeps the full frontend suite green.
- Every override added (likely 1–2 total) carries an inline
  comment explaining why the cross-import is genuine and what
  refactor would make it go away.

**Behaviour change.** None.

---

## Chunk 5.2 — BeltRanks → `LookupTableService` migration

**Branch:** `refactor/p5-2-belt-ranks-lookup-migration`
**Effort:** 1 day
**Risk:** Low — internal restructure of one service; the
  controller signature and public behaviour are unchanged.
**Requires:** —

**Background.** Chunk 3.5 introduced
`LookupTableService<TKey, TRow, TApi, TCreate, TUpdate, TNewRow, TPatch>`
as the base class for the simple belt-catalog CRUD services
(`BeltSystemsService`, `ShogoTitlesService`). `BeltRanksService`
was deliberately NOT migrated because its surface area
diverges enough to make the abstraction expensive at the time:

  - `create()` validates level-uniqueness against `(orgId,
    systemId, level)` AND enforces `publiclyVisible →
    slug.length > 0`.
  - `update()` does the level-uniqueness check, the slug
    refine, AND a self-reference cycle check on `nextRankId`.
  - The delete guard is three-table
    (`rank_history`/`next_rank_id`/`shogo.min_rank_id`).
  - `findPublicBySlug()` returns a hydrated
    `PublicRankResponse` shape (rank + system + optional
    organisation) — bespoke and unrelated to the standard
    `findByKey`.

The 3.5 commit documented this as deferred until a 4th
lookup table arrives. Phase 5 reverses that — migrate now,
keeping the bespoke parts as subclass-private methods
alongside the base's CRUD plumbing.

**Scope.**

1. **Inventory the bespoke logic** before touching code. Build
   a small table of every method on `BeltRanksService`,
   marking each:
     - **Base-provided** (drop from subclass; inherit).
     - **Subclass override** (extend base method with extra
       checks, then call `super`).
     - **Subclass-only** (new method that has no base
       counterpart).
   This becomes the migration contract.

2. **Add a `findByKey` alias to `BeltRanksRepository`** —
   same pattern as `belt-systems.repository.ts`. Required to
   satisfy the `LookupTableRepository` interface.

3. **Make `BeltRanksService extends LookupTableService`**.
   Wire up:
     - `entityLabel = 'Belt rank'`.
     - `toApi(row)` from the existing `toApi` method.
     - `inputToInsertValues(input)` from the existing `create`
       method's `repo.insert(...)` block, with the
       `null`-defaulted fields preserved.
     - `inputToPatch(input)` from the existing `buildPatch`.
     - `assertCanDelete(existing)` from the existing
       three-table check.
     - `findById(id)` as a thin alias for `findByKey(id)` to
       preserve the public surface (the controller calls
       `findById`).

4. **Override the base `create()` and `update()`** in the
   subclass to do the bespoke validations FIRST, then delegate
   to `super`. Specifically:
     - `override create`: call the slug refine + level
       collision check; if both pass, `return super.create(input)`.
     - `override update`: load existing, run the cycle check
       + slug refine + level collision check; if all pass,
       `return super.update(id, input)`.

5. **Keep `findPublicBySlug` as a subclass-only method** —
   it's not a CRUD operation; the base doesn't try to model
   public-slug lookups.

6. **Drop the duplicated `buildPatch` helper** — the base
   contract takes a `inputToPatch(input)` hook that replaces
   it.

**Acceptance criteria.**

- `BeltRanksService` extends `LookupTableService`; class
  shrinks meaningfully (target: 243 → ~150 lines).
- The five existing public methods on the controller surface
  (`list`, `findById`, `findPublicBySlug`, `create`, `update`,
  `delete`) keep their exact signatures and observable
  behaviour. No controller change.
- `belt-ranks.service.spec.ts` passes unchanged (the spec
  exercises behaviour, not internals).
- `belt-ranks.controller.spec.ts` (Phase 3.7) passes
  unchanged.
- Public-belt-ranks controller spec passes unchanged.
- Backend `tsc --noEmit` clean; full backend suite green.

**Behaviour change.** None.

---

## Chunk 5.3 — Organisations admin → tree-aware admin scaffold

**Branch family:** `refactor/p5-3-<short-slug>` (design then migration)
**Effort:** 3–4 days (1 day design, 2–3 days migration)
**Risk:** Medium — the organisations admin is the largest
  resource page in the app (tree + move dialog + members sheet
  + labels filter); a scaffold abstraction has to earn its keep
  against a working bespoke implementation.
**Requires:** Chunk 2.3 (the existing `ResourceAdminListPage`
  scaffold and the documented organisations non-goal).

**Background.** Chunk 2.3 built `ResourceAdminListPage` for
flat-list admin pages (techniques + patterns) and explicitly
left organisations out because:

  - Tree rendering instead of a flat table.
  - Move dialog with cycle detection.
  - Inline members `<Sheet>` (not a separate page).
  - `LabelsFilterBar` instead of classification multi-select.

Phase 5 picks this back up. The decision the chunk has to
make first: **one scaffold with conditional slots, or two
scaffolds (`ResourceAdminListPage` + `ResourceAdminTreePage`)
sharing a header + filters layout?**

### 5.3a — Design pass

  - **Inspect** the current organisations admin in detail:
    `pages/admin/organisations/list/`, the move dialog, the
    members sheet, the labels filter bar. Identify which
    behaviours are intrinsic to "tree-shaped admin" vs
    organisation-specific.

  - **Mock both options** as ~50-line scaffold sketches
    (markdown — no code change):
    1. **One scaffold, slot-based.** `ResourceAdminListPage`
       takes an optional `mainContent` prop (default: the
       existing list area). Organisations passes a tree
       component.
    2. **Two scaffolds, shared header layout.** Extract the
       header + filters + CTA chrome to
       `ResourceAdminPageShell` (no list-or-tree opinion).
       `ResourceAdminListPage` and `ResourceAdminTreePage`
       both compose the shell with their own content area.

  - **Score** each option on: lines of code added to support
    organisations, how invasively the existing `ListPage`
    changes, ergonomics for a future tree-shaped admin (none
    currently planned but possible).

  - **Pick one option**, write the choice + rationale to
    `docs/resource-admin-pattern.md` (the existing
    `ResourceAdminListPage` doc) as a "tree-aware variant"
    section.

  - **Decision gate.** The design step ships as a doc PR;
    user approves the choice before 5.3b starts.

### 5.3b — Migration

  - Implement the chosen scaffold variant.
  - Migrate `pages/admin/organisations/list/ui/...` to
    consume it.
  - Move dialog, members sheet, labels filter bar — keep
    their existing logic; the scaffold provides the
    surrounding chrome.

**Acceptance criteria.**

- 5.3a: design doc lands; user-approved option recorded in
  `resource-admin-pattern.md`.
- 5.3b: organisations admin page LOC drops vs the current
  bespoke version (real number depends on the chosen option;
  expected: −15 % to −30 %). If the LOC count goes UP, the
  scaffold is too leaky — pause and reconsider.
- The tree, move dialog, members sheet, and labels filter
  bar continue working unchanged at the user level
  (visually + functionally).
- Existing admin-organisations test files pass unchanged or
  with mechanical mock adjustments.

**Behaviour change.** None.

---

## Chunk 5.4 — Frontend testing audit + rolling backfill

**Branch family:** `refactor/p5-4-<area>-specs` (one per area)
**Effort:** rolling — first PR is the audit + the first slice
  (1 day); subsequent slices are ~30 min – 1 hour each.
**Risk:** Low — additive coverage, no production changes.
**Requires:** —

**Background.** Chunk 3.7 audited backend module coverage but
explicitly didn't touch frontend. Phase 5 closes that gap.

The frontend has different testing axes than the backend:

  - **Entities** — `lib/hooks.ts` is the main behaviour
    surface (query keys, mutation invalidations, optimistic
    updates). Most entities have at least one spec; pinning
    invalidation graphs would catch subtle regressions.
  - **Features** — components are the main testing target;
    many have specs already.
  - **Widgets** — composition-heavy; smoke tests for the
    main render paths.
  - **Pages** — route-level tests are integration-style;
    expensive to write, high value when they exist.

**Scope (sub-PR breakdown).**

### 5.4a — Audit + recipe

  - Run a per-layer file-count survey
    (`entities/*`, `features/*`, `widgets/*`, `pages/*`)
    measuring src files vs spec files (mirror the 3.7
    backend audit script).
  - Rank gaps by impact: hot-path features beat rarely-used
    widgets; entities with complex mutation graphs beat
    pure-data entities.
  - Pick the top 3–5 gaps. Write them to a target list in
    this doc as a 5.4 follow-on table.
  - Write a recipe doc (`docs/frontend-test-recipe.md`)
    covering: the QueryClient harness pattern, when to mock
    via barrel (link to `fsd-test-barrel-recipe.md`), when
    to use `userEvent` vs `fireEvent`, the i18n setup.

### 5.4b onwards — Per-area slices

  - Each slice tackles one layer × one slug (e.g.
    `entities/feedback` hooks, `features/feedback-thread`
    components, etc.). Following the 3.7 backend pattern:
    one PR per area, rolling.
  - Each slice keeps the full frontend suite green and
    adds the new spec(s) to it.

**Acceptance criteria.**

- 5.4a: audit table + recipe doc ship; the top 3–5 gaps
  are agreed.
- 5.4b onwards: per-PR, the target gap closes by at least
  one focused spec file; total frontend test count
  monotonically increases.

**Behaviour change.** None.

---

## Execution order

5.1, 5.2, and 5.4a are independent of everything else and can
land in parallel. 5.3 should land its design pass (5.3a) before
5.3b; the user approves the design choice between them. 5.4b
onwards is rolling and interleaves freely with the other tracks.

Recommended sequence:

  1. **5.1** — closes the remaining 5 arch errors. Quick wins,
     unblocks future PRs by clearing the arch baseline.
  2. **5.2** — internal restructure, single-PR scope.
  3. **5.4a** — audit + recipe; produces decisions for 5.4b.
  4. **5.3a** — design pass; user reviews; approve or revise.
  5. **5.3b** — migration.
  6. **5.4b onwards** — rolling.

Pause for review between each chunk (same protocol as the
original plan).
