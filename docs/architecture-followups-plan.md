# Architecture follow-ups — implementation plan

> **Status:** Drafted 2026-06-27, after the original 23-chunk plan
> (`docs/architecture-refactor-plan.md`) closed out.
>
> **Predecessor:** `docs/architecture-refactor-plan.md` (Phases 1–3).
> Read that first for context on the audit + the patterns this plan
> reuses (per-chunk branch, PR-per-chunk, audit-then-verify-then-merge
> protocol).

## What this plan covers

Three substantive follow-ups that surfaced during Phase 3 plus one
documentation chunk to close the original plan out cleanly. Numbered
**Phase 4** so a reader can tell at a glance that the work belongs
to the post-audit follow-up track, not the original refactor.

| Chunk | Scope                                                      | Effort       | Risk |
|-------|------------------------------------------------------------|--------------|------|
| 4.1   | Inbox `@ApiResponse` so OpenAPI reflects `Paginated<T>`    | 30 min       | None |
| 4.2   | Steiger / FSD layering cleanup — audit + barrel reshape    | 1 day        | Low  |
| 4.3   | Steiger / FSD layering cleanup — entity migrations         | rolling, ~7 PRs × ~30 min | Low |
| 4.4   | Mark the original refactor plan + review as delivered      | 15 min       | None |

## What this plan deliberately does NOT cover

Each of these was considered during planning and explicitly left
out. Listed so a future engineer reading the plan doesn't
re-derive them and assume they're oversights.

- **Repository-layer Postgres-harness specs.** The 6 uncovered
  repos (audit-log, users, organisations, memberships,
  belt-systems, belt-ranks, shogo-titles) would benefit from
  integration coverage, but the harness decision (testcontainers
  vs Supabase dev DB vs pg-mem) is a separate design pass with
  its own evaluation work. Tracked for a follow-on plan if
  product priorities allow.

- **`BeltRanksService` migration to `LookupTableService`.** Chunk
  3.5 documented why: the level-collision check, the slug
  refines, the cycle check on `nextRankId`, and the hydrated
  `findPublicBySlug` collectively make BeltRanks a poor fit for
  the flat-key scaffold. Defer until a 4th similarly-shaped
  lookup table arrives — then migrate all four at once with a
  scaffold that earns its abstraction.

- **Organisations admin migration to `ResourceAdminListPage`.**
  Chunk 2.3 documented why: the tree rendering + move dialog +
  members Sheet + LabelsFilterBar collectively diverge enough
  from a flat-list scaffold that forcing a fit would either
  bloat the scaffold or leave organisations as a permanent
  exception. Wait for a "tree-aware" admin pattern to be its
  own design pass.

- **Frontend testing audit + backfill.** 3.7 only audited
  backend module coverage. The frontend has ~78 spec files but
  no systematic per-feature ratio survey. Worth doing — but as
  its own initiative, not folded into this plan.

---

## Chunk 4.1 — Inbox `@ApiResponse` decorator

**Branch:** `refactor/p4-1-inbox-openapi-response`
**Effort:** 30 min
**Requires:** —
**Risk:** None

**Background.** Chunk 3.1 introduced `paginated()` and migrated
`FeedbackInboxResponseSchema` to use it. The Zod schema is
correct, the backend service emits the new envelope, the
frontend fetcher already extracts `.data`. But the OpenAPI spec
for `GET /api/feedback/inbox` still emits an empty 200
response shape — the endpoint never had an `@ApiResponse`
decorator wired, so the contract isn't reflected in the
generated spec.

**Scope.**

- Add `@ApiResponse({ ... })` to `FeedbackController.inbox`
  referencing the `FeedbackInboxResponseSchema` shape. The
  pattern is already used by ~15 other endpoints in this
  codebase; copy from `FeedbackController.unreadCount` (or any
  endpoint nearby that has a registered response).
- Re-run `pnpm openapi:generate` and commit the regenerated
  YAML/JSON.
- Confirm the diff is bounded to the inbox path's response
  block + the existing `FeedbackInboxResponse` `$ref` resolution
  (the schema itself doesn't change).

**Acceptance criteria.**

- `packages/contracts/openapi/openapi.yaml` shows a real
  response schema under `/api/feedback/inbox > get >
  responses > 200`.
- No other path's response shape changes.
- Backend `tsc --noEmit` clean.
- No new tests required (the contract change is documentation-
  only at the wire level).

**Behaviour change.** None.

---

## Chunk 4.2 — Steiger / FSD layering cleanup, audit + reshape

**Branch:** `refactor/p4-2-fsd-barrel-reshape`
**Effort:** 1 day
**Requires:** —
**Risk:** Low — test-only changes, no production code reshape.

**Background.** `pnpm arch` exits non-zero on `main` (7 errors,
22 warnings) — pre-existing FSD violations that surfaced during
chunk 3.3 but weren't introduced by it. The 7 errors are all
the same shape:

  - A test file mocks an entity's API module by its deep path
    (`@/entities/<name>/api/<name>.api.js`) because the
    corresponding `queries.ts` imports the fetcher from that
    deep path directly, not via the barrel (`@/entities/<name>`).
  - Mocking the barrel wouldn't reach the captured fetcher
    reference, so `vi.mock` MUST target the deep path.
  - `steiger.config.js` currently maintains a growing list of
    file-pattern overrides for `fsd/no-public-api-sidestep` to
    silence these.

The 22 warnings are `fsd/insignificant-slice` /
`fsd/repetitive-naming` / `fsd/no-segmentless-slices` — hygiene
notes that don't fail the build. Out of scope for this plan;
revisit if they grow.

**Scope.**

1. **Survey.** Run `pnpm --filter frontend arch` and capture
   the seven `fsd/no-public-api-sidestep` errors. Each error
   identifies one test file + one deep-imported entity API
   module. Build a table: `{ test file, entity, deep path,
   barrel path }`.

2. **Barrel API design.** For each entity surfaced in the
   survey, decide what its barrel (`index.ts`) should export
   to satisfy both:

     - Production-side consumers (`<name>.queries.ts`) that
       currently import the fetcher directly need to be able to
       call the fetcher through the barrel. Re-exporting the
       fetcher as a named export off the barrel is the
       cheapest path.
     - Test-side consumers want a stable mock surface. Mocking
       the barrel reaches every consumer that imports through it.

   Document the chosen shape in a one-line comment at the top
   of each barrel: which symbols are public API.

3. **Pick ONE entity as the proof migration.** Recommend
   `auth-by-email` — both `AppSidebar.test.tsx` and
   `useSignOut.test.ts` cite it, so a single migration retires
   two of the seven errors.

   For the chosen entity:
     - Add the fetcher to the entity barrel's exports.
     - Update the entity's own `queries.ts` to import the
       fetcher through its own barrel (or via a co-located
       internal import; pick what the FSD rule actually wants).
     - Update both test files to `vi.mock` the barrel path
       instead of the deep path.
     - Remove the two corresponding override entries from
       `steiger.config.js`.
     - Run `pnpm --filter frontend arch` — verify the two
       errors are gone and no new ones surfaced.

4. **Document the recipe.** Add a section to a doc (likely a
   new `docs/fsd-test-barrel-recipe.md` or appended to
   `docs/resource-admin-pattern.md`) explaining the
   "barrel + vi.mock barrel" pattern with the recipe steps so
   chunk 4.3 can be executed mechanically.

**Acceptance criteria.**

- One entity is fully migrated (production-side imports
  through barrel; tests mock barrel).
- Two errors disappear from `pnpm --filter frontend arch`.
- The corresponding override entries are removed from
  `steiger.config.js`.
- Recipe doc exists with copy-pasteable steps.
- Full frontend suite passes.

**Behaviour change.** None.

---

## Chunk 4.3 — Steiger / FSD layering cleanup, entity migrations (rolling)

**Branch:** `refactor/p4-3-<entity>-fsd-barrel` (one per entity)
**Effort:** ~30 min per entity, ~5 entities remaining after 4.2
**Requires:** Chunk 4.2 (recipe + first migration)
**Risk:** Low — mechanical application of the 4.2 recipe.

**Background.** With the recipe from 4.2 in place, the
remaining errors collapse into a mechanical loop.

**Scope.** For each remaining entity surfaced in 4.2's survey,
follow the recipe:

  - Add the deep-imported fetcher(s) to the entity barrel's
    public API.
  - Update the entity's own `queries.ts` to import through
    the barrel.
  - Update the offending test file(s) to `vi.mock` the barrel
    instead of the deep path.
  - Delete the corresponding `steiger.config.js` override
    block(s).
  - Run `pnpm --filter frontend arch` — verify the errors are
    gone.

Each entity ships as its own PR for easy review.

**Acceptance criteria.**

- After the last PR lands: `pnpm --filter frontend arch` exits
  with 0 errors (warnings remaining are out of scope).
- `steiger.config.js` has no `fsd/no-public-api-sidestep`
  override blocks left.
- Full frontend suite passes after each PR.

**Behaviour change.** None.

---

## Chunk 4.4 — Mark the refactor plan as delivered

**Branch:** `refactor/p4-4-archive-refactor-plan`
**Effort:** 15 min
**Requires:** —
**Risk:** None

**Background.** `docs/architecture-review.md` and
`docs/architecture-refactor-plan.md` are now historical — every
chunk from the original 23-chunk plan has either landed or
been documented as a deliberate non-goal. Leaving them as-is
risks a future engineer searching the docs and treating them
as live work.

**Scope.**

1. Add a status banner to the top of both files:

       > **Status:** Complete (2026-06-XX). Every chunk
       > delivered or documented as a deliberate non-goal.
       > Follow-ups live in `docs/architecture-followups-plan.md`.
       > Kept for archaeology; do NOT add new work here.

2. Update the chunk table in `architecture-refactor-plan.md`
   to mark each chunk as DONE with its merged-PR link.

3. Cross-link this followups plan from the original plan's
   status banner so a reader lands in the right place.

**Acceptance criteria.**

- Both files carry the status banner.
- Every chunk in `architecture-refactor-plan.md` has a status
  marker (DONE + PR # OR non-goal note).
- This plan is linked from both predecessors.

**Behaviour change.** None.

---

## Execution order

Chunks 4.1 and 4.4 are independent of everything else and small.
Either can land first. 4.2 must precede 4.3 (the recipe is the
4.2 deliverable).

Recommended sequence:

  1. **4.1** — quick win, closes a 3.1 loose end.
  2. **4.2** — survey + first proof migration. Decides the
     shape 4.3 mechanises.
  3. **4.3** — rolling per-entity PRs; can be interleaved with
     other work.
  4. **4.4** — last; references the chunks above as delivered.

Pause for review between each chunk (same protocol as the
original plan).
