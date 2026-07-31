# Statistics — design

**Status:** design approved. Implementation plan to follow.
**Author:** Claude (brainstormed with @stefanag)
**Date:** 2026-07-31

## 1. Goal

Give every role a way to see how the system is being used. Statistics live in the database, are updated on entity changes for structural metrics and refreshed nightly for activity metrics, and are surfaced both on dedicated pages and as embedded widgets on existing pages.

## 2. Requirements (from brainstorming)

- **Audiences:** sysadmin (platform), orgadmin (their org tree), instructor (their students), student (self).
- **Categories:** membership/headcount, progression/grading throughput, activity/engagement, content coverage, plus explicit belt-rank counts at club / federation / platform levels.
- **History:** monthly snapshots + current state.
- **Freshness:** structural stats real-time via DB triggers; activity stats nightly via a NestJS cron job.
- **Surface:** dedicated Statistics page per applicable role, plus a couple of key widgets embedded on existing pages.

## 3. Architecture — approach A (SQL-first)

Two Postgres tables in a new `statistics` schema, populated by database triggers for structural metrics and by a NestJS cron job for activity metrics + monthly snapshots. Reads are cheap `SELECT`s against `stat_current` and `stat_snapshot_monthly` — no request-time aggregation.

Chosen over:

- **Application-managed projections** — would put logic in TypeScript but leaves stats stale on any write that bypasses NestJS (seed scripts, migrations, direct SQL). Directly conflicts with the "calculated inside the database" preference.
- **On-the-fly queries + materialised views** — would push aggregation cost into every request and complicate the "monthly snapshot" model.

## 4. Data model

Two tables, one migration file (`apps/backend/drizzle/NNNN_statistics_triggers.sql`) that also carries the trigger DDL — Drizzle Kit doesn't manage triggers, so hand-written SQL is the only way to keep the schema and its triggers in lockstep.

```sql
-- Latest value for every (scope, metric[, dimension]) — what "as of now" reads hit.
CREATE TABLE stat_current (
  scope_type    text NOT NULL,       -- 'platform' | 'organisation' | 'user'
  scope_id      text NOT NULL,       -- org uuid / user id / '__platform__'
  metric        text NOT NULL,       -- see catalog below
  dimension_key text NOT NULL DEFAULT '',  -- e.g. rank uuid for rank_count; '' when N/A
  value         numeric NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id, metric, dimension_key)
);

-- Month-end snapshot for trend charts.
CREATE TABLE stat_snapshot_monthly (
  scope_type    text NOT NULL,
  scope_id      text NOT NULL,
  metric        text NOT NULL,
  dimension_key text NOT NULL DEFAULT '',
  year          smallint NOT NULL,
  month         smallint NOT NULL,   -- 1..12
  value         numeric NOT NULL,
  PRIMARY KEY (scope_type, scope_id, metric, dimension_key, year, month)
);
```

**Design calls:**

- `value` is `numeric` — every stat is a single number. Structured shapes (e.g. a top-10 list) get their own table later; no JSON blob shortcut.
- `dimension_key` is text-only, no FK. Keeps the stats module independent of any single source table's key type.
- `stat_current` is the single source of truth. The monthly snapshot is a copy taken on the first nightly run of each new calendar month.

## 5. Metric catalog

Every metric is stored at the scope level(s) listed. Org-tree rollup happens once, at write time, by the trigger walking ancestors — reads never aggregate.

| Metric | Dimension | Scope | Source | Freshness |
|---|---|---|---|---|
| `rank_count` | rankId | organisation, platform | current rank per user × their memberships | **real-time** (trigger on `rank_history`, `organisation_membership`) |
| `membership_count` | role (`student`\|`instructor`\|`orgadmin`) | organisation, platform | `organisation_membership` (active only) | **real-time** (trigger on `organisation_membership`) |
| `content_coverage_pct` | rankId | user | competent progress rows ÷ active requirement-set size | **real-time** (trigger on `user_content_progress`, `rank_requirement_*`) |
| `grading_events_month_to_date` | — | organisation, platform | rank_history rows this calendar month | nightly + on `rank_history` insert |
| `avg_months_between_ranks` | rankId | organisation, platform | mean gap between consecutive promotions | nightly |
| `active_users_last_30_days` | — | organisation, platform | distinct users with any write in {rank_history, progress, feedback} in the 30-day window | nightly |
| `feedback_threads_opened_month_to_date` | — | organisation, platform | `feedback_thread` inserts this month | nightly |

Adding a new metric = one migration (schema-level entry if needed) + a contract field + a widget. Documented in `docs/statistics.md` shipped with this PR.

## 6. Trigger design

One helper function plus one trigger set per source table. All triggers live in the same migration as the tables they read from — they participate in the source write's transaction, so a failed source write rolls back the stat delta with no compensating logic.

```sql
-- Idempotent: safe to call for any user, any change.
-- Walks the org-ancestor tree via a recursive CTE and updates
-- every affected (scope, rank) row + the platform row.
CREATE OR REPLACE FUNCTION statistics.apply_rank_delta(
  p_user_id text,
  p_rank_id uuid,
  p_delta   int   -- +1 or -1
) RETURNS void ...
```

| Trigger | Fires on | Behaviour |
|---|---|---|
| `rank_history_stats_ai` | `rank_history` INSERT | `apply_rank_delta(user, new_rank, +1)` + `-1` for the previous latest, if any |
| `rank_history_stats_ad` | `rank_history` DELETE | reversed |
| `membership_stats_ai / au / ad` | `organisation_membership` INSERT/UPDATE/DELETE | recompute `membership_count` for org + ancestors; re-apply user's rank_count to newly-covered / no-longer-covered orgs |
| `user_content_progress_stats_aiud` | `user_content_progress` INSERT/UPDATE/DELETE | recompute `content_coverage_pct` for (user, rankId) |

**Ancestor walk = recursive CTE inside the trigger function.** Fast at this scale (org trees are shallow), keeps stats transactionally consistent with the source write.

## 7. Nightly cron

NestJS `StatisticsCronService`, using `@nestjs/schedule`.

```
@Cron('0 3 * * *')   // 03:00 local, well after any batch jobs
async runNightly() {
  await this.repo.refreshActivityStats();      // grading_events_mtd, active_users_30d, feedback_mtd
  await this.repo.recomputeAvgGapPerRank();    // heavy-ish; nightly is fine
  await this.repo.captureMonthlyIfNewMonth();  // snapshot closing month on the first nightly of a new one
  await this.repo.rebuildAll();                // full self-heal; cheap at this scale (single-digit seconds)
}
```

**Self-heal.** `statistics.rebuild_all()` truncates `stat_current` and recomputes every real-time metric from source tables. Called unconditionally on every nightly run as a drift guardrail, and exposed as `POST /api/admin/statistics/rebuild` so a sysadmin can force it after a manual DB edit. If nightly rebuild ever becomes expensive (see Monitoring in Section 12) we split it into an incremental version at that point — not a v1 concern.

**The nightly self-heal makes triggers a nice-to-have for correctness, not load-bearing.** If a trigger has a bug or is bypassed, tomorrow's numbers are right.

## 8. API

New backend module `apps/backend/src/modules/statistics/`.

| Endpoint | Who | Returns |
|---|---|---|
| `GET /api/statistics/platform` | sysadmin | Every `scope_type='platform'` metric. |
| `GET /api/statistics/organisation/:id` | sysadmin OR user with `manage Organisation` on `:id` | Every org-scope metric for `:id` (headcount, activity, rank counts). |
| `GET /api/statistics/organisation/:id/trends?metric=X&months=12` | same as above | Time series from `stat_snapshot_monthly`. |
| `GET /api/statistics/user/:id` | sysadmin OR orgadmin of a shared org OR instructor of that student OR self | Coverage % per rank, progression summary. |
| `GET /api/statistics/user/:id/trends?metric=X&months=12` | same | User time series. |
| `POST /api/admin/statistics/rebuild` | sysadmin | Fires `statistics.rebuild_all()`. Response: `{ ok, durationMs }`. |

**Wire shape** — named-fields object beats a generic `[{metric, value}]` list for DX. Example org response:

```jsonc
{
  "scope": { "type": "organisation", "id": "…", "name": "Stockholm Club" },
  "metrics": {
    "membershipCount": { "student": 42, "instructor": 3, "orgadmin": 1 },
    "gradingEventsMonthToDate": 5,
    "activeUsersLast30Days": 28,
    "feedbackThreadsOpenedMonthToDate": 12
  },
  "ranks": [                                     // sorted by rank.sortOrder ASC
    { "rank": { "id": "…", "nameRomaji": "…", "nameEn": "…", "sortOrder": 1 }, "count": 12 },
    …
  ],
  "updatedAt": "2026-07-31T18:52:00.000Z"
}
```

Contracts live in one file: `packages/contracts/src/statistics.ts` — `PlatformStatsSchema`, `OrganisationStatsSchema`, `UserStatsSchema`, `StatsTrendPointSchema`. Server derives the shape from `stat_current` rows via a small mapper; the wire schema is authoritative, not the storage.

**Drill-down does not sum server-side.** Because the trigger already rolls each rank/membership up into every ancestor's row, the row for federation X already contains its member clubs' counts. A caller wanting drill-down calls the ancestor's endpoint first, then each child's — no server-side aggregation, no double-counting.

## 9. CASL

New subject `Statistics`. Per-instance conditions via the existing `{ __caslSubjectType__: 'Statistics', scopeType, scopeId, organisationId? }` pattern.

| Role | Rule |
|---|---|
| **Sysadmin** | Implicit — the existing "sysadmin manages all" rule already grants read on `Statistics`. No new rule needed. |
| **Orgadmin** | `read Statistics if scopeType='organisation' AND scopeId ∈ myOrgadminOrgs` — extended via the org-ancestor tree the same way requirement-set resolution does today. |
| **Instructor** | `read Statistics if scopeType='user' AND user ∈ studentsInMyClubs` — computed against the caller's memberships. |
| **Student** | `read Statistics if scopeType='user' AND scopeId=self.id`. |

No writes exposed except the sysadmin rebuild.

## 10. Frontend

FSD layering: one new `entities/statistics` slice for data fetching, small pure presentational widgets in `features/`, composed by dedicated pages plus embedded blocks on existing pages.

**Data layer** — `entities/statistics/`:
- `api/statistics.api.ts` — one function per endpoint, using the shared `httpClient`.
- `lib/hooks.ts` — `useOrganisationStatsQuery`, `useUserStatsQuery`, `useStatsTrendsQuery`, `useRebuildStatsMutation`.

**Presentational widgets** — take typed props from the contract schemas; no fetching:

| Widget | Shape |
|---|---|
| `<StatTile>` | Single big-number tile with label + optional delta arrow. |
| `<RankBreakdown>` | Belt-coloured rows or bars, one per rank sorted by `sortOrder`. |
| `<TrendSparkline>` | Inline SVG line/area chart, 12–24 monthly points. |
| `<CoverageMeter>` | Circular / linear progress bar for one rank's coverage %. |

**No chart library** — inline SVG covers everything at this scale. If we later need interactive tooltips or mixed chart types, reach for `recharts` and refactor; not required for MVP.

**Pages & embedded widgets:**

| Route | Role | Content |
|---|---|---|
| `/admin/statistics` (new: `pages/admin-statistics/`) | sysadmin | Platform tiles + rank-breakdown for the whole platform + trends. Search box to jump to any org's stats page. |
| Existing `/my-organisation` (add a section) | orgadmin | "Statistics" card block: 4 `StatTile`s + `<RankBreakdown>`. "See full history" link → `/organisation/:id/statistics`. |
| `/organisation/:id/statistics` (new: `pages/organisation-statistics/`) | orgadmin, sysadmin | Full org stats + trend charts. Ancestor breadcrumb + child-orgs list for drill-down. |
| Existing instructor students-view (add a widget per student) | instructor | Compact `<CoverageMeter>` per student in the class list. Click through to full student stats. |
| Existing `/profile` (add a section) | student (self) | `<CoverageMeter>` for their current rank + a "your progression" `<TrendSparkline>`. |

**Belt colours in `RankBreakdown` come from `rank.visuals`** (the JSONB column from migration 0027). No hardcoded palette in the widget — matches the [[token-boundary]] rule.

**Instructor mini-widget piggybacks on the existing student list** — no dedicated instructor statistics page. Reduces routing/permission surface.

## 11. Testing

**Backend:**

| Layer | Coverage | Approach |
|---|---|---|
| Repository (SQL functions + triggers) | `apply_rank_delta`, `rebuild_all`, ancestor rollup, `refresh*` methods | Real Postgres, e2e-style specs via existing `docker-compose.e2e.yml`. Mocking a trigger is meaningless. |
| Service | Authorisation branching, response mapping, ForbiddenException paths | Mock repo, standard NestJS unit test. |
| Controller | Route wiring, CASL guard, error envelope | Existing pattern from `feature-flags.controller.spec.ts`. |
| Abilities | Per-role read matrix for the new `Statistics` subject | Mirror `feature-flags.abilities.spec.ts`. |
| Cron | Job schedule + method invocation order (not the computation itself) | Fake timers + method spies. |

**Frontend:**
- `entities/statistics` query hooks: standard TanStack `renderHook` + spied `httpClient` (recipe in `docs/frontend-test-recipe.md`).
- Widgets: pure props — assert on visible text and roles, no snapshots.
- Pages: mock the entity hooks, assert layout + role gating.

## 12. Rollout

**Single deploy, no feature flag.** Triggers are cheap and read endpoints are gated by CASL, so there's no user-visible risk.

Order inside the PR:

1. `NNNN_statistics_triggers.sql` — creates `stat_current`, `stat_snapshot_monthly`, `apply_rank_delta`, `rebuild_all`, all triggers.
2. Migration ends with `SELECT statistics.rebuild_all();` — backfills every real-time metric from existing source tables.
3. Application code shipped in the same commit reads the now-populated tables.

**Backfill for historical snapshots — start collecting from now.**
- **Reconstructable** (rank counts + membership counts): could be replayed from `rank_history` timestamps + membership activated/deactivated_at for past months. Nice-to-have; deferred to a follow-up PR if trend charts feel empty at launch.
- **Not reconstructable** (activity, feedback, coverage): need per-day event log we don't keep in a queryable shape. Charts start at deploy-day.

**Monitoring.** Log `rebuild_all()` duration on every nightly run. If it exceeds ~30 s at expected volume, that's the signal to add indexes or move to incremental refresh. NestJS scheduler already surfaces cron failures through the existing exception filter.

## 13. Documentation

`docs/statistics.md` ships in the same PR:
- Metric catalog (Section 5 of this doc, kept in sync).
- Which triggers write which table.
- How to add a new metric (SQL migration + contract + widget).
- Where the rebuild button lives + when to press it.

Prevents this becoming folklore.

## 14. Out of scope for v1

- Historical backfill of monthly snapshots (see Section 12).
- Public "how big is this club" profile stats (only signed-in scopes for now).
- Cross-org comparison views (e.g. "top 10 most active clubs"). Compose from platform + per-org endpoints if later wanted.
- Alerting on stat thresholds ("send email when active_users_last_30_days drops X%"). Different concern; different module if ever built.
