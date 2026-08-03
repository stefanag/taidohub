# Statistics

This doc covers the database-first statistics feature: how metrics are collected, where to find them, and how to extend the catalog.

---

## 1. What lives here

Two Postgres tables store all metrics:

- **`stat_current`** — latest value for every `(scope, metric, dimension)`. Reads are cheap `SELECT`s.
- **`stat_snapshot_monthly`** — month-end snapshots for trend charts.

Real-time structural metrics (`rank_count`, `membership_count`, `content_coverage_pct`) are maintained by AFTER-triggers on source tables (`rank_history`, `organisation_membership`, `user_content_progress`). Activity metrics and monthly snapshots are refreshed by a `@nestjs/schedule` cron job at 03:00 UTC daily. All SQL lives in `apps/backend/drizzle/0033_statistics_triggers.sql`. The NestJS module is at `apps/backend/src/modules/statistics/`. Ancestor rollup happens in SQL via recursive CTE — every metric is written at the org level and propagated to all ancestors plus the platform level.

---

## 2. Metric catalog

| Metric | Dimension | Scope | Source | Freshness |
|---|---|---|---|---|
| `rank_count` | rankId | organisation, platform | current rank per user × their memberships | **real-time** (trigger on `rank_history`, `organisation_membership`) |
| `membership_count` | role (`student`\|`instructor`\|`orgadmin`) | organisation, platform | `organisation_membership` (active only) | **real-time** (trigger on `organisation_membership`) |
| `content_coverage_pct` | rankId | user | competent progress rows ÷ active requirement-set size | **real-time** (trigger on `user_content_progress`, `rank_requirement_*`) |
| `grading_events_month_to_date` | — | organisation, platform | rank_history rows this calendar month | nightly + on `rank_history` insert |
| `avg_months_between_ranks` | rankId | organisation, platform | mean gap between consecutive promotions | nightly |
| `active_users_last_30_days` | — | organisation, platform | distinct users with any write in {rank_history, progress, feedback} in the 30-day window | nightly |
| `feedback_threads_opened_month_to_date` | — | organisation, platform | `feedback_thread` inserts this month | nightly |

---

## 3. How to add a new metric

1. **Decide freshness:** Is the metric structural (updated when entities change) or activity-based (recalculated nightly)?

2. **If real-time:** Add logic to the appropriate `on_*_change()` trigger function in `0033_statistics_triggers.sql`, or write a new trigger. Then run `pnpm --filter backend db:generate` to create a new migration file with your raw SQL trigger additions.

3. **If nightly:** Write a new method in `StatisticsRepository` (e.g., `computeNewMetric(executor?: DrizzleExecutor)`). Call it from `runNightly()` in `StatisticsCronService`.

4. **Add the field to the contract:** Update `packages/contracts/src/statistics.ts` — extend the appropriate schema (`PlatformStatsSchema`, `OrganisationStatsSchema`, or `UserStatsSchema`) with a `myNewMetric` field.

5. **Map it in the service:** Update `StatisticsService.toApi()` to extract your new metric from `stat_current` rows and assemble it into the response shape.

6. **Surface it in the UI:** Add a widget or tile in `apps/frontend/src/features/` (or extend an existing one) and place it on the relevant page (`AdminStatisticsPage`, `OrganisationStatisticsPage`, or profile).

7. **Test at every layer:** Repository (e2e SQL test using real Postgres), Service (mocked repo), Controller (route + CASL guard), and Frontend (mock the entity hook, test the widget).

---

## 4. Rebuilding stats manually

The rebuild button is at `/admin/statistics` (sysadmin only). It calls `POST /api/admin/statistics/rebuild`.

**When to press it:**
- After a bulk data seed or direct SQL edit outside the application.
- If you suspect drift between `stat_current` and source tables.

**What the response tells you:**
```json
{ "ok": true, "durationMs": 1234 }
```

Sanity-check `durationMs` — it should be single-digit seconds. If it ever exceeds 30 seconds at expected volume, that's the signal to add indexes or move to incremental refresh.

---

## 5. Monitoring hooks

The nightly cron logs:
```
[statistics] rebuild_all completed in <N>ms
```

Monitor this duration over time. Drift detection is a future enhancement: compare the `stat_current` values against a fresh run of `rebuild_all()` to spot silent trigger failures or data inconsistencies.

**Multi-membership deduplication note:** Users with memberships in multiple organisations under the same parent are deduplicated by user across shared ancestors. When extending a trigger for a new org-scope aggregate, apply the same `DISTINCT` pattern as `apply_rank_delta()` and `rebuild_all()` do.

---

## Additional references

- **Backend module:** `apps/backend/src/modules/statistics/`
- **Data layer:** `apps/backend/src/infrastructure/database/schema/statistics.ts`
- **Contracts:** `packages/contracts/src/statistics.ts`
- **Frontend data layer:** `apps/frontend/src/entities/statistics/`
- **Frontend widgets:** `apps/frontend/src/features/{stat-tile,rank-breakdown,trend-sparkline,coverage-meter}/`
- **Frontend pages:** `apps/frontend/src/pages/{admin-statistics,organisation-statistics}/`
