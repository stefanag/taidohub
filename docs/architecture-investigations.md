# Architecture investigations

> **Purpose.** Items that surfaced during the architecture refactor
> tracks (Phases 1–5) where the right next move requires discovery
> work — research, prototyping, or a decision the team hasn't
> agreed on yet — before a concrete implementation plan is worth
> writing. Each investigation has its own section; close out by
> linking the resulting plan PR(s) from the section.

---

## INV-1 — Postgres harness for repository-layer specs

**Surfaced from.** Phase 3.7 (backend testing backfill) and the
Phase 5 plan. The 6 backend repositories (`audit-log`, `users`,
`organisations`, `memberships`, `belt-systems`, `belt-ranks`,
`shogo-titles`) are the largest remaining uncovered surface in
the codebase. Pure unit tests don't reach them — they're thin
SQL adapters whose value is "the SQL works against real
Postgres."

### Why this is an investigation, not a plan

Picking a test harness has long-term consequences:

  - It locks the team's local-dev story (does every contributor
    need Docker? a Supabase account? neither?).
  - It locks the CI story (cold-start latency per test file
    multiplies across ~10 repo specs).
  - It locks the SQL fidelity story (some harnesses lie about
    extensions, RLS, or FK semantics — the lie shows up as a
    "passes in test, fails in prod" surprise).

None of those are reversible once 50+ repository tests are
written against the chosen harness. The cost of picking wrong
is rewriting them all.

### What's known about the constraint

  - **Database.** Postgres (Supabase Postgres in prod). Uses
    the session-mode PgBouncer pooler at port 5432 in dev.
  - **Migrations.** Drizzle migrations live in
    `apps/backend/src/infrastructure/database/migrations`.
    Pure SQL, ordered by filename.
  - **Existing helpers.** `infrastructure/database/client.ts`
    is the singleton factory introduced in Chunk 1.3 — it
    asserts only one pool per `DATABASE_URL` at runtime.
  - **CI.** Backend CI currently does
    `pnpm turbo run lint typecheck arch build test`. No
    Postgres container or DB is provisioned in the workflow.
    The first repository spec PR pays the CI infra cost.
  - **Local dev.** Contributors currently run against the
    real Supabase dev DB via `DIRECT_URL` or the pooled
    `DATABASE_URL`. There's no in-process or containerised
    database step.

### Candidate options

| Option | Fidelity | Cold start | Per-dev cost | CI cost |
|--------|----------|------------|--------------|---------|
| **testcontainers** | Real Postgres in Docker. Full fidelity (extensions, FKs, jsonb, RLS if installed). | ~3–5 s per test file the first time; subsequent test files reuse the container. | Requires Docker locally. | ~30 s one-time + ~0 s/file once warm. |
| **Supabase dev DB** | Production-identical. | ~50–200 ms per query (networked). | Reuses prod-DB workflow; no Docker. | Networked latency per query; risk of cross-test pollution unless every spec wraps in a tx and rolls back. |
| **pg-mem** (in-memory) | JS Postgres simulator. Missing extensions, partial FK semantics, no RLS, jsonb quirks. | ~5 ms per test file. | None. | None. |
| **PGlite** (newer in-memory) | WASM-compiled real Postgres. Higher fidelity than pg-mem; still limited (no extensions, no replication). | ~50 ms per test file. | None. | None. |
| **Supabase local CLI** | Real Postgres + the surrounding Supabase services, in Docker via `supabase start`. | ~10 s warm. | Requires Docker + supabase CLI. | Heavier than testcontainers; matches Supabase prod exactly. |
| **Hybrid** | Repo tests in PGlite (fast), one or two integration tests in testcontainers (real). | Tiered. | Docker required for the integration tier only. | Same as testcontainers for the small set + zero for the rest. |

### Trade-offs

  - **Fidelity vs speed.** This is the core axis. Real-Postgres
    options catch SQL-dialect bugs the JS simulators miss. JS
    simulators don't require Docker and have ~100× faster cold
    start.
  - **Local dev story.** Anything requiring Docker is friction
    for contributors on locked-down work machines or low-RAM
    laptops. Anything requiring network access is friction for
    offline iteration.
  - **CI infrastructure.** testcontainers and supabase-local
    need a Docker step in the workflow. Supabase dev DB needs
    a secret-managed connection string in CI. pg-mem and
    PGlite need nothing.
  - **What kind of bugs do repo specs catch?** Most repo bugs
    are: "I wrote `eq()` instead of `and(eq(), eq())`," "I
    forgot a `.returning()`," "I left a stale `tx` reference."
    These are caught by ANY harness. The bugs only real
    Postgres catches: "this trigger fires that we forgot
    about," "this jsonb path operator doesn't work in pg-mem,"
    "RLS hides this row from us in prod." The base rate of
    those bugs in this codebase is currently unknown.

### Decision criteria

Before picking, the investigation should answer:

  1. **What's the base rate of "fidelity-only" bugs in the
     codebase as-shipped?** Sample: pick 5 recently-merged
     repository changes from `git log` and re-test them under
     each harness. If pg-mem catches all 5, the cheap option
     is good enough.
  2. **What's the contributor pain tolerance?** Survey: are
     team members already running Docker? Are any working
     offline? The harness choice should match the floor, not
     the ceiling.
  3. **What's CI's existing latency budget?** Backend CI
     currently runs in ~3 minutes. Adding 30 s for testcontainers
     setup is a 17 % increase — fine. Adding 5 s × 10 specs ×
     5 cold-starts is the same. The math matters.
  4. **What does the Supabase migration story look like?** If
     prod migrations run via Supabase CLI tooling, the harness
     should ideally run the SAME migration command — not
     diverge to a separate "test migrations" path. Otherwise
     the test database can drift from the prod schema in
     subtle ways.

### Proposed investigation deliverable

A single doc, ~1 day of work:

  1. Stand up each top candidate (testcontainers, Supabase dev
     DB, PGlite) against a single trivial repo spec (e.g.
     `audit-log.repository.spec.ts` exercising one insert +
     one list).
  2. Measure: cold start time, per-test execution time,
     migration-application path, fidelity (do all the
     project's SQL idioms work?).
  3. Run the "5 recent repo changes" base-rate experiment.
  4. Pick a winner; write the recommendation up as a 1-page
     RFC. Capture the decision criteria from above so a
     future maintainer understands *why* the choice was made.
  5. RFC ships as its own doc PR for review.
  6. If approved, a new Phase 5+ chunk track captures the
     repo-spec rollout using the chosen harness.

### Pre-decision recommendation

If the team wants to move without waiting for the
investigation, **PGlite** is the lowest-friction default and
the right "try first, escalate if fidelity bites" choice. It
runs in Node, no Docker, no network, and is built on real
Postgres (WASM) so the fidelity gap vs the heavier options is
narrower than pg-mem's. The escalation path — drop to
testcontainers for the specs that PGlite can't handle — is
mechanical.

If the team has Docker on every dev machine already AND the
CI infrastructure to support a Docker step, **testcontainers**
is the safer default at the cost of cold-start latency.

The investigation closes once one of those is committed to.

### Status

  - **Opened:** 2026-06-28.
  - **Owner:** unassigned.
  - **Blocking:** the Phase 5 plan's deliberate exclusion of
    repository-spec chunks.
  - **Closed by:** TBD. (Update with PR # once an RFC ships
    and a harness choice lands.)

---

## INV-2 — `LookupTableService` abstraction scope

**Surfaced from.** Phase 5.2 (`BeltRanksService` migration to
`LookupTableService`). The migration was attempted in PR
[refactor/p5-2-belt-ranks-lookup-migration]; the work passed
all tests + typecheck but failed the plan's LOC acceptance
criterion ("class shrinks meaningfully; if LOC goes UP, the
scaffold is too leaky") and was reverted. This entry pins the
lesson so a future engineer doesn't re-attempt the migration
without first reading what happened.

### What was attempted

The Phase 5 plan extended `LookupTableService` (introduced in
Chunk 3.5 for `BeltSystemsService` + `ShogoTitlesService`) to
also cover `BeltRanksService`. The plan acknowledged BeltRanks
has bespoke logic (level collision, slug refine, nextRankId
cycle check, three-table delete guard, hydrated
`findPublicBySlug`) and proposed handling each as either an
overridden CRUD method or a subclass-only addition.

Implementation:

  - `BeltRanksService extends LookupTableService<...>` with full
    7-arg generic type binding.
  - 5 abstract hooks implemented: `entityLabel`, `toApi`,
    `inputToInsertValues`, `inputToPatch`, `assertCanDelete`.
  - `create()` and `update()` overridden — bespoke checks first,
    then `super.create(input)` / `super.update(id, input)`.
  - `findPublicBySlug` retained as subclass-only.
  - `findById(id)` retained as a thin alias for `findByKey(id)`
    so the controller's call surface didn't change.
  - `lookupByKey` overridden to route through `findById`
    directly so existing spec mocks worked unchanged.
  - Repository got a `findByKey` alias delegating to
    `findById` to satisfy the `LookupTableRepository` contract.
  - All 63 belt-catalog specs + the full 544-test backend
    suite passed without modification.

### Why it was reverted

The plan's acceptance gate:

  > Class shrinks meaningfully (target: 243 → ~150 lines). If
  > the LOC count goes UP, the scaffold is too leaky — pause
  > and reconsider.

Actual result: **243 → 269 lines (+26)**.

Cause:

  - The base abstract demands 5 hooks (`entityLabel`, `toApi`,
    `inputToInsertValues`, `inputToPatch`, `assertCanDelete`)
    plus a `lookupByKey` override.
  - Every bespoke check survives as an override — none of them
    were inheritable.
  - Class scaffolding (generic args, override modifiers, super
    calls) is per-method tax.

The method bodies actually shrank ~13 lines vs the original
implementation. The +26 line growth lived in the docstring,
generic class header, and the hook-override pattern. The
abstraction worked but didn't pay rent.

### The lesson

`LookupTableService` is well-fitted to entities that are TRULY
simple lookup tables: a flat key, no cross-row validation, no
bespoke CRUD verbs. `BeltSystemsService` and `ShogoTitlesService`
are the existence proof — both shrank when they migrated.

For entities with override hooks in 2 or more CRUD verbs
(`create` + `update` here), the LOC cost of the abstraction
outweighs the consistency gain at the current 3-entity scale.
Pulling them in still works, the tests still pass, but the
abstraction's primary deliverable (less code) inverts.

### Heuristic for future use

When considering whether to migrate an entity onto
`LookupTableService`:

  1. **Count the bespoke override hooks the entity would need.**
     If ≤ 1 (e.g. just a custom `assertCanDelete`), migration is
     likely a win.
  2. **Check for cross-row validation in create/update.** Level
     collision against `(orgId, systemId, level)`, slug refines
     coupled to another field, cycle checks on self-references
     — each one means an override hook. ≥ 2 of these → migration
     likely loses LOC.
  3. **Check for hydrated / projection-shaped lookups.** A
     `findPublicBySlug` that joins other tables doesn't fit
     `findByKey`; it stays subclass-only either way and doesn't
     argue for or against migration on its own.
  4. **Verify the spec mock surface.** Existing tests targeting
     `findById` etc. work fine if the subclass overrides
     `lookupByKey` to route through the original method, but
     that override itself is dead-weight code if it's the only
     reason for the migration.

### What this means for the abstraction

The base class stays. It's correct for what it covers
(BeltSystems + ShogoTitles) and the migration path it
documents (those services genuinely shrank). The change is in
when we reach for it: not "any CRUD service in belt-catalog,"
but "any CRUD service that satisfies the heuristic above."

A 4th simple-shaped lookup table arriving is the natural moment
to revisit. If at that point BeltRanks STILL doesn't fit, the
diagnosis won't change.

### Status

  - **Opened:** 2026-06-28.
  - **Closed:** 2026-06-28 — decision recorded; PR reverted.
  - **Related PR:** `refactor/p5-2-belt-ranks-lookup-migration`
    (closed unmerged; the data point lives in its commit
    message + this entry).
  - **Follow-up:** none required. The Phase 5 plan's chunk 5.2
    is considered closed-without-migration.
