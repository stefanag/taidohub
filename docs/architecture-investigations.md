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
