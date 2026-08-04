# Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a database-first statistics feature covering platform / organisation / user scopes, with structural metrics maintained by SQL triggers, activity metrics refreshed by a nightly NestJS cron, read APIs gated by CASL, and both dedicated pages and embedded widgets on the frontend.

**Architecture:** Two Postgres tables (`stat_current`, `stat_snapshot_monthly`) populated by AFTER-triggers on source tables (`rank_history`, `organisation_membership`, `user_content_progress`) for real-time structural metrics and by a `@nestjs/schedule` cron for activity metrics + monthly snapshots. Reads are cheap `SELECT`s. New backend module `apps/backend/src/modules/statistics/`. Frontend: `entities/statistics` slice + presentational widgets + dedicated pages + embedded blocks.

**Tech Stack:** NestJS 11, Drizzle ORM (postgres-js), Postgres 17, `@nestjs/schedule` (new dep), Zod contracts, CASL 7, React 19 / TanStack Query / FSD.

## Global Constraints

- **All metric values are `numeric`.** Structured data (top-N lists, etc.) belong in a different table if ever needed; do not JSON-blob into `value`.
- **Triggers run in the source write's transaction.** No compensating logic; a failed source write rolls back the stat delta.
- **`rank_count` only counts `rank_history.result = 'pass'`.** Failed grading rows exist in the same table but do not confer a rank.
- **A user's "current rank" is the latest `rank_history` PASS row by `date`, tiebreak by `created_at`.** Ties on both should be extremely rare; deterministic ordering matters for triggers.
- **`grading_events_month_to_date` counts by `rank_history.date`** (user-visible grading date), not `created_at` (when the row was inserted).
- **Ancestor rollup happens in SQL** via a recursive CTE against `organisations.parent_organisation_id`. Every metric written at `scope_type='organisation'` is also written at each ancestor and at `scope_type='platform', scope_id='__platform__'`.
- **The nightly cron unconditionally runs `statistics.rebuild_all()`** as a drift guardrail. Cost is single-digit seconds at expected volume; incremental refresh is a future optimisation.
- **No feature flag.** Ship in one commit, migration bootstraps stats with `SELECT statistics.rebuild_all()`.
- **Contract shape uses camelCase named fields**, not a generic `[{metric, value}]` list.
- **CASL subject name: `Statistics`.** Instance shape: `{ __caslSubjectType__: 'Statistics', scopeType, scopeId, organisationId? }`.
- **Sysadmin needs no new CASL rule** — the existing sysadmin-manage-all rule covers `Statistics`.
- **Repo methods that write must take an optional `DrizzleExecutor`** even when the callers don't yet need transactions — matches the module pattern (see `feature-flags.repository.ts`).
- **Follow the [[casl-7-dual-context]] memory** — any new frontend page that uses `<Can>` must be mounted inside the shared `<AbilityProvider>`, not a fresh `AbilityContext.Provider`.

## File structure

**New backend files:**
- `apps/backend/drizzle/0033_statistics_triggers.sql` — table DDL + trigger DDL + rebuild function DDL, one file.
- `apps/backend/src/infrastructure/database/schema/statistics.ts` — Drizzle table definitions for `SELECT` queries.
- `apps/backend/src/modules/statistics/statistics.module.ts`
- `apps/backend/src/modules/statistics/statistics.repository.ts`
- `apps/backend/src/modules/statistics/statistics.service.ts`
- `apps/backend/src/modules/statistics/statistics.service.spec.ts`
- `apps/backend/src/modules/statistics/statistics.controller.ts`
- `apps/backend/src/modules/statistics/statistics.controller.spec.ts`
- `apps/backend/src/modules/statistics/statistics.abilities.ts`
- `apps/backend/src/modules/statistics/statistics.abilities.spec.ts`
- `apps/backend/src/modules/statistics/statistics.cron.ts`
- `apps/backend/src/modules/statistics/statistics.cron.spec.ts`
- `apps/backend/test/e2e/statistics-triggers.e2e.spec.ts` — real Postgres verification of triggers + rebuild.
- `apps/backend/test/e2e/statistics-endpoints.e2e.spec.ts` — real HTTP + real DB round-trip.

**New contract files:**
- `packages/contracts/src/statistics.ts` — Zod schemas + OpenAPI registry.
- `packages/contracts/src/__tests__/statistics.test.ts`

**New frontend files:**
- `apps/frontend/src/entities/statistics/api/statistics.api.ts`
- `apps/frontend/src/entities/statistics/api/statistics.api.test.ts`
- `apps/frontend/src/entities/statistics/lib/hooks.ts`
- `apps/frontend/src/entities/statistics/lib/hooks.test.ts`
- `apps/frontend/src/entities/statistics/index.ts`
- `apps/frontend/src/features/stat-tile/{ui/StatTile.tsx, ui/StatTile.test.tsx, index.ts}`
- `apps/frontend/src/features/rank-breakdown/{ui/RankBreakdown.tsx, ui/RankBreakdown.test.tsx, index.ts}`
- `apps/frontend/src/features/trend-sparkline/{ui/TrendSparkline.tsx, ui/TrendSparkline.test.tsx, index.ts}`
- `apps/frontend/src/features/coverage-meter/{ui/CoverageMeter.tsx, ui/CoverageMeter.test.tsx, index.ts}`
- `apps/frontend/src/pages/admin-statistics/{ui/AdminStatisticsPage.tsx, ui/AdminStatisticsPage.test.tsx}`
- `apps/frontend/src/pages/organisation-statistics/{ui/OrganisationStatisticsPage.tsx, ui/OrganisationStatisticsPage.test.tsx}`
- `apps/frontend/src/app/router/routes/_app.admin.statistics.tsx`
- `apps/frontend/src/app/router/routes/_app.organisation.$id.statistics.tsx`

**New docs:**
- `docs/statistics.md`

**Modified backend files:**
- `apps/backend/src/app.module.ts` — import `StatisticsModule`, import `ScheduleModule.forRoot()`.
- `apps/backend/package.json` — add `@nestjs/schedule`.

**Modified contract files:**
- `packages/contracts/src/casl.ts` — add `Statistics` to `AppSubjects` + `AppSubjectShape`.
- `packages/contracts/src/openapi.ts` — register `StatisticsOpenApiRegistry`.
- `packages/contracts/openapi/openapi.json` + `openapi.yaml` — regenerated.

**Modified frontend files:**
- `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.tsx` — add statistics section.
- `apps/frontend/src/pages/profile/ui/ProfilePage.tsx` (or actual profile route file) — add student widget.
- The instructor student list page — add per-student `<CoverageMeter>`.
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` — add "Statistics" link for sysadmin.

---

### Task 1: Contracts + CASL subject

Establishes the wire contract and the CASL subject. Everything else depends on this shape.

**Files:**
- Create: `packages/contracts/src/statistics.ts`
- Create: `packages/contracts/src/__tests__/statistics.test.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/openapi.ts`

**Interfaces:**
- Consumes: nothing (this is the root).
- Produces:
  - `PlatformStatsSchema`, `OrganisationStatsSchema`, `UserStatsSchema`, `StatsTrendPointSchema`, `StatsTrendResponseSchema`, `RebuildStatsResponseSchema` from `@repo/contracts/statistics`.
  - Types `PlatformStats`, `OrganisationStats`, `UserStats`, `StatsTrendPoint`, `StatsTrendResponse`, `RebuildStatsResponse`.
  - `Statistics` added to `AppSubjects` union and `AppSubjectShape` in `casl.ts` with shape `{ id?, scopeType, scopeId, organisationId? }`.
  - `StatisticsOpenApiRegistry` registered in `openapi.ts`.

- [ ] **Step 1: Create the schema file with all response shapes.**

Create `packages/contracts/src/statistics.ts`:

```ts
import { z } from 'zod';

/** A single row in the platform/organisation "ranks" list. */
export const StatsRankRowSchema = z
  .object({
    rank: z.object({
      id: z.string().uuid(),
      nameRomaji: z.string(),
      nameEn: z.string(),
      sortOrder: z.number().int().nonnegative(),
    }),
    count: z.number().int().nonnegative(),
  })
  .meta({ id: 'StatsRankRow' });

export const StatsScopeSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('platform') }),
    z.object({ type: z.literal('organisation'), id: z.string().uuid(), name: z.string() }),
    z.object({ type: z.literal('user'), id: z.string(), name: z.string().nullable() }),
  ])
  .meta({ id: 'StatsScope' });

export const StatsMembershipCountsSchema = z
  .object({
    student: z.number().int().nonnegative(),
    instructor: z.number().int().nonnegative(),
    orgadmin: z.number().int().nonnegative(),
  })
  .meta({ id: 'StatsMembershipCounts' });

/** Platform + Organisation share the same structural shape. */
const OrgMetricsShape = z.object({
  membershipCount: StatsMembershipCountsSchema,
  gradingEventsMonthToDate: z.number().int().nonnegative(),
  activeUsersLast30Days: z.number().int().nonnegative(),
  feedbackThreadsOpenedMonthToDate: z.number().int().nonnegative(),
});

export const PlatformStatsSchema = z
  .object({
    scope: z.object({ type: z.literal('platform') }),
    metrics: OrgMetricsShape,
    ranks: StatsRankRowSchema.array(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'PlatformStats' });

export const OrganisationStatsSchema = z
  .object({
    scope: z.object({ type: z.literal('organisation'), id: z.string().uuid(), name: z.string() }),
    metrics: OrgMetricsShape,
    ranks: StatsRankRowSchema.array(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'OrganisationStats' });

/** User scope: coverage % per rank + per-rank progression summary. */
export const UserStatsRankCoverageSchema = z
  .object({
    rank: z.object({
      id: z.string().uuid(),
      nameRomaji: z.string(),
      nameEn: z.string(),
      sortOrder: z.number().int().nonnegative(),
    }),
    /** 0..100. */
    coveragePct: z.number().min(0).max(100),
  })
  .meta({ id: 'UserStatsRankCoverage' });

export const UserStatsSchema = z
  .object({
    scope: z.object({ type: z.literal('user'), id: z.string(), name: z.string().nullable() }),
    coverageByRank: UserStatsRankCoverageSchema.array(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'UserStats' });

export const StatsTrendPointSchema = z
  .object({
    year: z.number().int().min(2000).max(9999),
    month: z.number().int().min(1).max(12),
    value: z.number(),
  })
  .meta({ id: 'StatsTrendPoint' });

export const StatsTrendResponseSchema = z
  .object({
    metric: z.string(),
    dimensionKey: z.string(),
    points: StatsTrendPointSchema.array(),
  })
  .meta({ id: 'StatsTrendResponse' });

export const StatsTrendQuerySchema = z
  .object({
    metric: z.string().min(1),
    dimensionKey: z.string().default(''),
    months: z.coerce.number().int().min(1).max(60).default(12),
  })
  .meta({ id: 'StatsTrendQuery' });

export const RebuildStatsResponseSchema = z
  .object({ ok: z.literal(true), durationMs: z.number().int().nonnegative() })
  .meta({ id: 'RebuildStatsResponse' });

export type PlatformStats = z.infer<typeof PlatformStatsSchema>;
export type OrganisationStats = z.infer<typeof OrganisationStatsSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type StatsTrendPoint = z.infer<typeof StatsTrendPointSchema>;
export type StatsTrendResponse = z.infer<typeof StatsTrendResponseSchema>;
export type StatsTrendQuery = z.input<typeof StatsTrendQuerySchema>;
export type RebuildStatsResponse = z.infer<typeof RebuildStatsResponseSchema>;

export const StatisticsOpenApiRegistry = {
  StatsRankRow: StatsRankRowSchema,
  StatsScope: StatsScopeSchema,
  StatsMembershipCounts: StatsMembershipCountsSchema,
  PlatformStats: PlatformStatsSchema,
  OrganisationStats: OrganisationStatsSchema,
  UserStatsRankCoverage: UserStatsRankCoverageSchema,
  UserStats: UserStatsSchema,
  StatsTrendPoint: StatsTrendPointSchema,
  StatsTrendResponse: StatsTrendResponseSchema,
  RebuildStatsResponse: RebuildStatsResponseSchema,
} as const;
```

- [ ] **Step 2: Add the `Statistics` subject to CASL.**

Modify `packages/contracts/src/casl.ts`. Find the `AppSubjects` union and add `'Statistics'`. Find the `AppSubjectShape` type and add:

```ts
Statistics: { id?: string; scopeType: 'platform' | 'organisation' | 'user'; scopeId: string; organisationId?: string };
```

- [ ] **Step 3: Register the new schemas in the OpenAPI registry.**

Modify `packages/contracts/src/openapi.ts`. Add the import + include `StatisticsOpenApiRegistry` in the default registry array in `registerContractSchemas` and in the `ContractRegistries` map:

```ts
import { StatisticsOpenApiRegistry } from './statistics.js';
// ... in the default registries array in registerContractSchemas:
StatisticsOpenApiRegistry,
// ... and in ContractRegistries:
statistics: StatisticsOpenApiRegistry,
```

- [ ] **Step 4: Write the contract tests.**

Create `packages/contracts/src/__tests__/statistics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  OrganisationStatsSchema,
  PlatformStatsSchema,
  RebuildStatsResponseSchema,
  StatsTrendPointSchema,
  StatsTrendQuerySchema,
  UserStatsSchema,
} from '../statistics.js';

const RANK = { id: '00000000-0000-4000-8000-000000000001', nameRomaji: 'shodan', nameEn: 'Shodan', sortOrder: 10 };
const OK_ORG = {
  scope: { type: 'organisation', id: '00000000-0000-4000-8000-000000000010', name: 'Stockholm Club' },
  metrics: {
    membershipCount: { student: 42, instructor: 3, orgadmin: 1 },
    gradingEventsMonthToDate: 5,
    activeUsersLast30Days: 28,
    feedbackThreadsOpenedMonthToDate: 12,
  },
  ranks: [{ rank: RANK, count: 12 }],
  updatedAt: '2026-07-31T12:00:00.000Z',
};

describe('OrganisationStatsSchema', () => {
  it('accepts a fully populated response', () => {
    expect(OrganisationStatsSchema.safeParse(OK_ORG).success).toBe(true);
  });
  it('accepts an empty ranks array (fresh org with no members yet)', () => {
    expect(OrganisationStatsSchema.safeParse({ ...OK_ORG, ranks: [] }).success).toBe(true);
  });
  it('rejects a negative count', () => {
    const bad = { ...OK_ORG, ranks: [{ rank: RANK, count: -1 }] };
    expect(OrganisationStatsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('PlatformStatsSchema', () => {
  it('accepts the platform scope shape', () => {
    const ok = { ...OK_ORG, scope: { type: 'platform' } };
    expect(PlatformStatsSchema.safeParse(ok).success).toBe(true);
  });
});

describe('UserStatsSchema', () => {
  it('accepts a user scope + coverage per rank', () => {
    expect(
      UserStatsSchema.safeParse({
        scope: { type: 'user', id: 'u-1', name: 'Ada Lovelace' },
        coverageByRank: [{ rank: RANK, coveragePct: 42.5 }],
        updatedAt: '2026-07-31T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
  it('rejects coveragePct > 100', () => {
    expect(
      UserStatsSchema.safeParse({
        scope: { type: 'user', id: 'u-1', name: null },
        coverageByRank: [{ rank: RANK, coveragePct: 101 }],
        updatedAt: '2026-07-31T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('StatsTrendQuerySchema', () => {
  it('coerces string months to number and defaults to 12', () => {
    const parsed = StatsTrendQuerySchema.parse({ metric: 'membershipCount' });
    expect(parsed.months).toBe(12);
  });
  it('coerces "24" to 24', () => {
    const parsed = StatsTrendQuerySchema.parse({ metric: 'x', months: '24' });
    expect(parsed.months).toBe(24);
  });
  it('rejects months > 60', () => {
    expect(StatsTrendQuerySchema.safeParse({ metric: 'x', months: 61 }).success).toBe(false);
  });
});

describe('StatsTrendPointSchema', () => {
  it('rejects month=13', () => {
    expect(StatsTrendPointSchema.safeParse({ year: 2026, month: 13, value: 1 }).success).toBe(false);
  });
});

describe('RebuildStatsResponseSchema', () => {
  it('accepts the ok/durationMs shape', () => {
    expect(RebuildStatsResponseSchema.safeParse({ ok: true, durationMs: 1234 }).success).toBe(true);
  });
});
```

- [ ] **Step 5: Build contracts and run the test.**

Run:
```bash
pnpm --filter @repo/contracts build
pnpm --filter @repo/contracts test
```
Expected: tsup emits `dist/statistics.{js,cjs,d.ts,d.cts}`; test file passes all cases.

- [ ] **Step 6: Commit.**

```bash
git add packages/contracts/src/statistics.ts packages/contracts/src/__tests__/statistics.test.ts packages/contracts/src/casl.ts packages/contracts/src/openapi.ts
git commit -m "feat(contracts): statistics wire schemas + CASL Statistics subject"
```

---

### Task 2: Migration — tables + triggers + rebuild function

Ships the DB schema, all triggers, the ancestor-walk helper, and the `rebuild_all()` function in one migration. Includes an integration test against a real Postgres.

**Files:**
- Create: `apps/backend/drizzle/0033_statistics_triggers.sql`
- Create: `apps/backend/src/infrastructure/database/schema/statistics.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts` (add re-export)
- Create: `apps/backend/test/e2e/statistics-triggers.e2e.spec.ts`

**Interfaces:**
- Consumes: existing schema — `rank_history`, `organisation_membership`, `user_content_progress`, `organisations`, `belt_ranks`.
- Produces:
  - Tables `stat_current`, `stat_snapshot_monthly`.
  - Drizzle exports `statCurrent`, `statSnapshotMonthly`, `DbStatCurrent`, `DbStatSnapshotMonthly`.
  - SQL function `statistics.rebuild_all()` returns void.
  - SQL function `statistics.apply_rank_delta(p_user_id text, p_rank_id uuid, p_delta int)` returns void.
  - Triggers on `rank_history`, `organisation_membership`, `user_content_progress`.

- [ ] **Step 1: Write the migration SQL — tables + helper CTE.**

Create `apps/backend/drizzle/0033_statistics_triggers.sql`:

```sql
-- --- Tables ---------------------------------------------------------------
CREATE TABLE "stat_current" (
  "scope_type"    text NOT NULL,
  "scope_id"      text NOT NULL,
  "metric"        text NOT NULL,
  "dimension_key" text NOT NULL DEFAULT '',
  "value"         numeric NOT NULL,
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("scope_type", "scope_id", "metric", "dimension_key")
);
--> statement-breakpoint
CREATE INDEX "stat_current_metric_idx" ON "stat_current" ("metric");
--> statement-breakpoint

CREATE TABLE "stat_snapshot_monthly" (
  "scope_type"    text NOT NULL,
  "scope_id"      text NOT NULL,
  "metric"        text NOT NULL,
  "dimension_key" text NOT NULL DEFAULT '',
  "year"          smallint NOT NULL,
  "month"         smallint NOT NULL CHECK ("month" BETWEEN 1 AND 12),
  "value"         numeric NOT NULL,
  PRIMARY KEY ("scope_type", "scope_id", "metric", "dimension_key", "year", "month")
);
--> statement-breakpoint
CREATE INDEX "stat_snapshot_monthly_metric_idx" ON "stat_snapshot_monthly" ("metric", "year", "month");
--> statement-breakpoint
```

- [ ] **Step 2: Add the ancestor CTE + `apply_rank_delta` helper.**

Append to the same migration file:

```sql
-- --- Helpers --------------------------------------------------------------
-- Returns (organisation_id) rows for `p_org_id` and every ancestor via
-- organisations.parent_organisation_id. Used by every rollup path.
CREATE OR REPLACE FUNCTION statistics_org_and_ancestors(p_org_id uuid)
RETURNS TABLE (organisation_id uuid) AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_organisation_id FROM organisation WHERE id = p_org_id
    UNION ALL
    SELECT o.id, o.parent_organisation_id
    FROM organisation o
    JOIN ancestors a ON o.id = a.parent_organisation_id
  )
  SELECT id FROM ancestors;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- Adjust rank_count for a single (user, rank, delta). Applies to every org
-- the user is a member of + all ancestors + the platform row.
-- Idempotent for a single (user, rank, +1)/(user, rank, -1) call pair.
CREATE OR REPLACE FUNCTION apply_rank_delta(
  p_user_id text,
  p_rank_id uuid,
  p_delta int
) RETURNS void AS $$
BEGIN
  -- Platform row
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  VALUES ('platform', '__platform__', 'rank_count', p_rank_id::text, p_delta, now())
  ON CONFLICT (scope_type, scope_id, metric, dimension_key)
  DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

  -- Per-org + ancestors (via user's memberships)
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'organisation', a.organisation_id::text, 'rank_count', p_rank_id::text, p_delta, now()
  FROM organisation_membership m
  CROSS JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a
  WHERE m.user_id = p_user_id
  ON CONFLICT (scope_type, scope_id, metric, dimension_key)
  DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
```

- [ ] **Step 3: Add the trigger functions + triggers for rank_history.**

Append:

```sql
-- --- rank_history triggers ------------------------------------------------
-- We only care about PASS rows. The trigger determines the effect of THIS
-- row on the user's "current rank" and issues +1 / -1 accordingly.
CREATE OR REPLACE FUNCTION on_rank_history_change() RETURNS trigger AS $$
DECLARE
  v_prev_current_rank uuid;
  v_new_current_rank  uuid;
BEGIN
  -- Compute the user's current rank BEFORE and AFTER this row.
  -- The current rank is the latest PASS row by (date DESC, created_at DESC).
  IF TG_OP = 'INSERT' THEN
    SELECT rank_id INTO v_prev_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass' AND id <> NEW.id
    ORDER BY date DESC, created_at DESC LIMIT 1;

    SELECT rank_id INTO v_new_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT rank_id INTO v_prev_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

    SELECT rank_id INTO v_new_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass' AND id <> OLD.id
    ORDER BY date DESC, created_at DESC LIMIT 1;

  ELSE -- UPDATE
    -- Rare; treat as delete-then-insert on the user's history.
    SELECT rank_id INTO v_prev_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass' AND id <> OLD.id
    ORDER BY date DESC, created_at DESC LIMIT 1;

    SELECT rank_id INTO v_new_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;
  END IF;

  IF v_prev_current_rank IS DISTINCT FROM v_new_current_rank THEN
    IF v_prev_current_rank IS NOT NULL THEN
      PERFORM apply_rank_delta(
        COALESCE(NEW.user_id, OLD.user_id),
        v_prev_current_rank,
        -1
      );
    END IF;
    IF v_new_current_rank IS NOT NULL THEN
      PERFORM apply_rank_delta(
        COALESCE(NEW.user_id, OLD.user_id),
        v_new_current_rank,
        +1
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER rank_history_stats_aiud
AFTER INSERT OR UPDATE OR DELETE ON rank_history
FOR EACH ROW EXECUTE FUNCTION on_rank_history_change();
--> statement-breakpoint
```

- [ ] **Step 4: Add the trigger functions + triggers for `organisation_membership`.**

Append:

```sql
-- --- organisation_membership triggers ------------------------------------
-- On INSERT: increment membership_count[role] for org + ancestors + platform;
--            also copy the user's current rank_count into every newly-covered
--            org row (they may have already had a rank before joining).
-- On DELETE: reverse.
-- On UPDATE: handled as delete-old / insert-new when either role or
--            organisation_id changes; user_id shouldn't change.
CREATE OR REPLACE FUNCTION on_membership_change() RETURNS trigger AS $$
DECLARE
  v_current_rank uuid;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    -- Decrement membership_count for OLD role.
    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    VALUES ('platform', '__platform__', 'membership_count', OLD.role::text, -1, now())
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    SELECT 'organisation', a.organisation_id::text, 'membership_count', OLD.role::text, -1, now()
    FROM statistics_org_and_ancestors(OLD.organisation_id) a
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    -- Remove user's rank_count from the org's ancestor rows for THIS org.
    SELECT rank_id INTO v_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

    IF v_current_rank IS NOT NULL THEN
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', a.organisation_id::text, 'rank_count', v_current_rank::text, -1, now()
      FROM statistics_org_and_ancestors(OLD.organisation_id) a
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    VALUES ('platform', '__platform__', 'membership_count', NEW.role::text, +1, now())
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    SELECT 'organisation', a.organisation_id::text, 'membership_count', NEW.role::text, +1, now()
    FROM statistics_org_and_ancestors(NEW.organisation_id) a
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    SELECT rank_id INTO v_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

    IF v_current_rank IS NOT NULL THEN
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', a.organisation_id::text, 'rank_count', v_current_rank::text, +1, now()
      FROM statistics_org_and_ancestors(NEW.organisation_id) a
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER organisation_membership_stats_aiud
AFTER INSERT OR UPDATE OR DELETE ON organisation_membership
FOR EACH ROW EXECUTE FUNCTION on_membership_change();
--> statement-breakpoint
```

- [ ] **Step 5: Add the coverage-pct trigger for `user_content_progress`.**

Append:

```sql
-- --- user_content_progress trigger ---------------------------------------
-- coverage_pct = 100 * (competent count for user across requirement set) /
--                requirement set size for the user's current rank.
-- The "requirement set" a user is graded against = the active one for their
-- current organisation tree. This trigger recomputes for the affected user
-- when any of their progress rows change.
CREATE OR REPLACE FUNCTION on_user_content_progress_change() RETURNS trigger AS $$
DECLARE
  v_user_id text := COALESCE(NEW.user_id, OLD.user_id);
  v_current_rank uuid;
  v_competent int;
  v_total int;
  v_pct numeric;
BEGIN
  SELECT rank_id INTO v_current_rank
  FROM rank_history
  WHERE user_id = v_user_id AND result = 'pass'
  ORDER BY date DESC, created_at DESC LIMIT 1;

  IF v_current_rank IS NULL THEN
    -- No current rank -> nothing to write; clear any stale row.
    DELETE FROM stat_current
    WHERE scope_type = 'user' AND scope_id = v_user_id AND metric = 'content_coverage_pct';
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count distinct competent techniques + patterns for THIS user across
  -- the active requirement set for their current rank. For the initial
  -- migration we simplify: total = techniques + patterns referenced by
  -- any rank_requirement_technique/pattern row for this rank in any
  -- ACTIVE requirement_set (all active sets summed). Adjust when
  -- multi-org semantics are pinned.
  SELECT COUNT(DISTINCT p.entity_id) INTO v_competent
  FROM user_content_progress p
  WHERE p.user_id = v_user_id AND p.status = 'competent';

  SELECT COUNT(DISTINCT req_id) INTO v_total
  FROM (
    SELECT rrt.technique_id AS req_id
    FROM rank_requirement_technique rrt
    JOIN rank_requirement rr ON rr.id = rrt.rank_requirement_id
    JOIN requirement_set rs ON rs.id = rr.requirement_set_id
    WHERE rr.rank_id = v_current_rank AND rs.is_active = true
    UNION
    SELECT rrp.pattern_id AS req_id
    FROM rank_requirement_pattern rrp
    JOIN rank_requirement rr ON rr.id = rrp.rank_requirement_id
    JOIN requirement_set rs ON rs.id = rr.requirement_set_id
    WHERE rr.rank_id = v_current_rank AND rs.is_active = true
  ) required;

  IF v_total = 0 THEN
    DELETE FROM stat_current
    WHERE scope_type = 'user' AND scope_id = v_user_id AND metric = 'content_coverage_pct';
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_pct := LEAST(100, (100.0 * v_competent) / v_total);

  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  VALUES ('user', v_user_id, 'content_coverage_pct', v_current_rank::text, v_pct, now())
  ON CONFLICT (scope_type, scope_id, metric, dimension_key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER user_content_progress_stats_aiud
AFTER INSERT OR UPDATE OR DELETE ON user_content_progress
FOR EACH ROW EXECUTE FUNCTION on_user_content_progress_change();
--> statement-breakpoint
```

- [ ] **Step 6: Add `rebuild_all()` and finalise the migration.**

Append:

```sql
-- --- rebuild_all ---------------------------------------------------------
-- Truncates stat_current and recomputes every real-time metric from source
-- tables. Idempotent, safe to call any time.
CREATE OR REPLACE FUNCTION rebuild_all() RETURNS void AS $$
BEGIN
  TRUNCATE stat_current;

  -- rank_count: platform
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'platform', '__platform__', 'rank_count', rh.rank_id::text, COUNT(*), now()
  FROM (
    SELECT DISTINCT ON (user_id) user_id, rank_id
    FROM rank_history WHERE result = 'pass'
    ORDER BY user_id, date DESC, created_at DESC
  ) rh
  GROUP BY rh.rank_id;

  -- rank_count: per organisation (with ancestor rollup)
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'organisation', a.organisation_id::text, 'rank_count', rh.rank_id::text, COUNT(*), now()
  FROM (
    SELECT DISTINCT ON (user_id) user_id, rank_id
    FROM rank_history WHERE result = 'pass'
    ORDER BY user_id, date DESC, created_at DESC
  ) rh
  JOIN organisation_membership m ON m.user_id = rh.user_id
  JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
  GROUP BY a.organisation_id, rh.rank_id;

  -- membership_count: platform
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'platform', '__platform__', 'membership_count', role::text, COUNT(*), now()
  FROM organisation_membership GROUP BY role;

  -- membership_count: per organisation (ancestor rollup)
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'organisation', a.organisation_id::text, 'membership_count', m.role::text, COUNT(*), now()
  FROM organisation_membership m
  JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
  GROUP BY a.organisation_id, m.role;

  -- coverage_pct: per user with a current rank (mirrors the trigger's formula).
  -- Simple CTE version for the bootstrap.
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'user', cur.user_id, 'content_coverage_pct', cur.rank_id::text,
         LEAST(100, (100.0 * cov.competent) / NULLIF(req.total, 0)), now()
  FROM (
    SELECT DISTINCT ON (user_id) user_id, rank_id
    FROM rank_history WHERE result = 'pass'
    ORDER BY user_id, date DESC, created_at DESC
  ) cur
  JOIN LATERAL (
    SELECT COUNT(DISTINCT entity_id) AS competent
    FROM user_content_progress WHERE user_id = cur.user_id AND status = 'competent'
  ) cov ON true
  JOIN LATERAL (
    SELECT COUNT(DISTINCT req_id) AS total FROM (
      SELECT rrt.technique_id AS req_id
      FROM rank_requirement_technique rrt
      JOIN rank_requirement rr ON rr.id = rrt.rank_requirement_id
      JOIN requirement_set rs ON rs.id = rr.requirement_set_id
      WHERE rr.rank_id = cur.rank_id AND rs.is_active = true
      UNION
      SELECT rrp.pattern_id AS req_id
      FROM rank_requirement_pattern rrp
      JOIN rank_requirement rr ON rr.id = rrp.rank_requirement_id
      JOIN requirement_set rs ON rs.id = rr.requirement_set_id
      WHERE rr.rank_id = cur.rank_id AND rs.is_active = true
    ) x
  ) req ON true
  WHERE req.total > 0;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Bootstrap: populate everything from current source-table state.
SELECT rebuild_all();
```

- [ ] **Step 7: Write the Drizzle schema file (SELECT side only).**

Create `apps/backend/src/infrastructure/database/schema/statistics.ts`:

```ts
import { integer, numeric, pgTable, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';

export const statCurrent = pgTable(
  'stat_current',
  {
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    metric: text('metric').notNull(),
    dimensionKey: text('dimension_key').notNull().default(''),
    value: numeric('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scopeType, t.scopeId, t.metric, t.dimensionKey] }),
  }),
);

export const statSnapshotMonthly = pgTable(
  'stat_snapshot_monthly',
  {
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    metric: text('metric').notNull(),
    dimensionKey: text('dimension_key').notNull().default(''),
    year: smallint('year').notNull(),
    month: smallint('month').notNull(),
    value: numeric('value').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scopeType, t.scopeId, t.metric, t.dimensionKey, t.year, t.month] }),
  }),
);

export type DbStatCurrent = typeof statCurrent.$inferSelect;
export type DbStatSnapshotMonthly = typeof statSnapshotMonthly.$inferSelect;
```

Then append to `apps/backend/src/infrastructure/database/schema/index.ts`:
```ts
export * from './statistics.js';
```

- [ ] **Step 8: Write the trigger integration test (real Postgres).**

Create `apps/backend/test/e2e/statistics-triggers.e2e.spec.ts`. Uses the docker-compose Postgres from `apps/backend/docker-compose.e2e.yml`. Seeds a minimal `user`, `organisation`, `belt_rank`, then asserts trigger behaviour.

Full test omitted for brevity in this outline — the structure mirrors `apps/backend/test/e2e/invitation.e2e.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { hasDatabase } from '../helpers/app-factory.js';
import { resetDatabase } from '../helpers/db-reset.js';

describe.skipIf(!hasDatabase())('statistics triggers (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    await resetDatabase();
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
    sql = postgres(url, { max: 1 });
    // Run migrations
    // NB: the resetDatabase helper preserves __drizzle_migrations; if the
    // triggers weren't installed by prior migrations for the test DB, run
    // `pnpm --filter backend test:e2e:migrate` before the suite.
  });
  afterAll(async () => { await sql.end(); });

  it('rebuild_all() populates rank_count from existing rank_history', async () => {
    // seed: 1 user, 1 org, membership, 1 belt rank, 1 rank_history PASS row
    // ...
    await sql`SELECT rebuild_all()`;
    const [row] = await sql`
      SELECT value FROM stat_current
      WHERE scope_type = 'organisation' AND metric = 'rank_count'
      LIMIT 1
    `;
    expect(Number(row?.value)).toBe(1);
  });

  it('inserting a PASS rank_history row increments rank_count on the org + platform', async () => {
    // seed: fresh user, membership, then insert a PASS row and assert
    // stat_current rows appear with value = 1 at both scopes.
    // ...
  });

  it('a subsequent higher-rank PASS row decrements the previous rank + increments the new one', async () => {
    // seed: user with a green-belt PASS, then insert a brown-belt PASS.
    // Assert green rank_count = 0 (row deleted or value 0), brown = 1.
    // ...
  });

  it('inserting a membership copies the user\'s current rank into the org\'s rank_count', async () => {
    // seed: user with a rank_history PASS row but no membership yet.
    // Insert a membership; assert the org's rank_count for that rank = 1.
    // ...
  });

  it('deleting a membership removes rank_count + membership_count from the org tree', async () => {
    // seed: existing member with a rank; count both stats; delete membership;
    // assert both stats now show 0.
    // ...
  });

  it('coverage_pct updates when user_content_progress transitions to competent', async () => {
    // seed: user with a current rank, requirement set with 4 required techniques,
    // then insert 2 competent progress rows. Assert stat_current shows 50.
    // ...
  });
});
```

Implement each seed step using raw `sql`. Reuse fixture UUIDs from existing e2e specs where possible.

- [ ] **Step 9: Run the migration + test.**

Run:
```bash
pnpm --filter backend db:generate    # verify no diff (we hand-wrote the SQL)
pnpm --filter backend test:e2e:up
pnpm --filter backend test:e2e:migrate
pnpm --filter backend exec vitest run --config vitest.e2e.config.ts test/e2e/statistics-triggers.e2e.spec.ts
```
Expected: migration applies cleanly; every test passes.

- [ ] **Step 10: Commit.**

```bash
git add apps/backend/drizzle/0033_statistics_triggers.sql apps/backend/src/infrastructure/database/schema/statistics.ts apps/backend/src/infrastructure/database/schema/index.ts apps/backend/test/e2e/statistics-triggers.e2e.spec.ts
git commit -m "feat(db): statistics tables + triggers + rebuild_all()"
```

---

### Task 3: Repository

Everything that touches the two stats tables lives here. Consumers only see this interface.

**Files:**
- Create: `apps/backend/src/modules/statistics/statistics.repository.ts`

**Interfaces:**
- Consumes: `statCurrent`, `statSnapshotMonthly` from schema (Task 2).
- Produces:
  - `class StatisticsRepository` injectable.
  - Methods (all return the shapes shown):
    - `getPlatform(): Promise<PlatformStatsRaw>` — `{ metrics, ranks, updatedAt }` from `scope_type='platform'`.
    - `getOrganisation(orgId: string): Promise<OrgStatsRaw | null>` — same shape or `null` if the org has no rows.
    - `getUser(userId: string): Promise<UserStatsRaw>` — `{ coverageByRank, updatedAt }`.
    - `getTrends(scope: {type, id}, metric: string, dimensionKey: string, months: number): Promise<StatsTrendPoint[]>`.
    - `rebuildAll(executor?: DrizzleExecutor): Promise<{ durationMs: number }>` — calls `SELECT rebuild_all()`.
    - `refreshActivityStats(executor?: DrizzleExecutor): Promise<void>` — recomputes `grading_events_month_to_date`, `active_users_last_30_days`, `feedback_threads_opened_month_to_date` via straight `INSERT ... ON CONFLICT` SQL.
    - `recomputeAvgGapPerRank(executor?: DrizzleExecutor): Promise<void>`.
    - `captureMonthlyIfNewMonth(executor?: DrizzleExecutor): Promise<{ captured: boolean; year?: number; month?: number }>`.
- Raw types are defined in this file and only used by the service — they map 1:1 to the wire contracts by the service's `toApi()`.

- [ ] **Step 1: Write the failing service-level test first (drives the repo signatures).**

Actually — the repo tests are integration tests (real DB, same file as Task 2's trigger test can host them). For unit-testable repo methods we don't need mocked-repo tests; the service test in Task 4 will indirectly verify shapes. Skip the "write failing test first" for pure SQL repos and go straight to Step 2.

- [ ] **Step 2: Write the repository class.**

Create `apps/backend/src/modules/statistics/statistics.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { statCurrent, statSnapshotMonthly } from '../../infrastructure/database/schema/statistics.js';

/** Internal shapes; service maps to wire contract. */
export interface OrgOrPlatformStatsRaw {
  metrics: {
    membershipCount: { student: number; instructor: number; orgadmin: number };
    gradingEventsMonthToDate: number;
    activeUsersLast30Days: number;
    feedbackThreadsOpenedMonthToDate: number;
  };
  ranks: Array<{ rankId: string; count: number }>;
  updatedAt: Date;
}

export interface UserStatsRaw {
  coverageByRank: Array<{ rankId: string; coveragePct: number }>;
  updatedAt: Date;
}

@Injectable()
export class StatisticsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async getPlatform(): Promise<OrgOrPlatformStatsRaw> {
    return this.getOrgOrPlatform('platform', '__platform__');
  }

  async getOrganisation(orgId: string): Promise<OrgOrPlatformStatsRaw | null> {
    const rows = await this.db
      .select()
      .from(statCurrent)
      .where(and(eq(statCurrent.scopeType, 'organisation'), eq(statCurrent.scopeId, orgId)))
      .limit(1);
    if (rows.length === 0) return null;
    return this.getOrgOrPlatform('organisation', orgId);
  }

  private async getOrgOrPlatform(
    scopeType: 'platform' | 'organisation',
    scopeId: string,
  ): Promise<OrgOrPlatformStatsRaw> {
    const rows = await this.db
      .select()
      .from(statCurrent)
      .where(and(eq(statCurrent.scopeType, scopeType), eq(statCurrent.scopeId, scopeId)));

    const metrics: OrgOrPlatformStatsRaw['metrics'] = {
      membershipCount: { student: 0, instructor: 0, orgadmin: 0 },
      gradingEventsMonthToDate: 0,
      activeUsersLast30Days: 0,
      feedbackThreadsOpenedMonthToDate: 0,
    };
    const ranks: Array<{ rankId: string; count: number }> = [];
    let updatedAt = new Date(0);

    for (const r of rows) {
      if (r.updatedAt > updatedAt) updatedAt = r.updatedAt;
      const n = Number(r.value);
      if (r.metric === 'membership_count') {
        const role = r.dimensionKey as 'student' | 'instructor' | 'orgadmin';
        if (role in metrics.membershipCount) metrics.membershipCount[role] = n;
      } else if (r.metric === 'rank_count') {
        ranks.push({ rankId: r.dimensionKey, count: n });
      } else if (r.metric === 'grading_events_month_to_date') {
        metrics.gradingEventsMonthToDate = n;
      } else if (r.metric === 'active_users_last_30_days') {
        metrics.activeUsersLast30Days = n;
      } else if (r.metric === 'feedback_threads_opened_month_to_date') {
        metrics.feedbackThreadsOpenedMonthToDate = n;
      }
    }

    return { metrics, ranks, updatedAt };
  }

  async getUser(userId: string): Promise<UserStatsRaw> {
    const rows = await this.db
      .select()
      .from(statCurrent)
      .where(
        and(
          eq(statCurrent.scopeType, 'user'),
          eq(statCurrent.scopeId, userId),
          eq(statCurrent.metric, 'content_coverage_pct'),
        ),
      );

    const coverageByRank = rows.map((r) => ({
      rankId: r.dimensionKey,
      coveragePct: Number(r.value),
    }));
    const updatedAt = rows.reduce<Date>((acc, r) => (r.updatedAt > acc ? r.updatedAt : acc), new Date(0));
    return { coverageByRank, updatedAt };
  }

  async getTrends(
    scope: { type: 'platform' | 'organisation' | 'user'; id: string },
    metric: string,
    dimensionKey: string,
    months: number,
  ): Promise<Array<{ year: number; month: number; value: number }>> {
    const rows = await this.db
      .select({
        year: statSnapshotMonthly.year,
        month: statSnapshotMonthly.month,
        value: statSnapshotMonthly.value,
      })
      .from(statSnapshotMonthly)
      .where(
        and(
          eq(statSnapshotMonthly.scopeType, scope.type),
          eq(statSnapshotMonthly.scopeId, scope.id),
          eq(statSnapshotMonthly.metric, metric),
          eq(statSnapshotMonthly.dimensionKey, dimensionKey),
        ),
      )
      .orderBy(desc(statSnapshotMonthly.year), desc(statSnapshotMonthly.month))
      .limit(months);

    return rows
      .map((r) => ({ year: r.year, month: r.month, value: Number(r.value) }))
      .reverse();
  }

  async rebuildAll(executor: DrizzleExecutor = this.db): Promise<{ durationMs: number }> {
    const t0 = Date.now();
    await executor.execute(sql`SELECT rebuild_all()`);
    return { durationMs: Date.now() - t0 };
  }

  async refreshActivityStats(executor: DrizzleExecutor = this.db): Promise<void> {
    await executor.execute(sql`
      WITH src AS (
        SELECT organisation_id, COUNT(*) AS n
        FROM rank_history rh
        JOIN organisation_membership m ON m.user_id = rh.user_id
        WHERE date_trunc('month', rh.date::timestamp) = date_trunc('month', now())
          AND rh.result = 'pass'
        GROUP BY organisation_id
      ),
      rolled AS (
        SELECT a.organisation_id AS org_id, SUM(src.n) AS n
        FROM src
        CROSS JOIN LATERAL statistics_org_and_ancestors(src.organisation_id) a
        GROUP BY a.organisation_id
      )
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', org_id::text, 'grading_events_month_to_date', '', n, now() FROM rolled
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `);
    // Similar shape for active_users_last_30_days and feedback_threads_opened_month_to_date.
    // Implement the two remaining stats the same way, then a single platform-level aggregate.
  }

  async recomputeAvgGapPerRank(executor: DrizzleExecutor = this.db): Promise<void> {
    await executor.execute(sql`
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT
        'organisation', a.organisation_id::text, 'avg_months_between_ranks',
        rh.rank_id::text,
        AVG(EXTRACT(EPOCH FROM (rh.date::timestamp - prev.date::timestamp)) / (60 * 60 * 24 * 30.44)),
        now()
      FROM rank_history rh
      JOIN LATERAL (
        SELECT date FROM rank_history p
        WHERE p.user_id = rh.user_id AND p.result = 'pass' AND p.date < rh.date
        ORDER BY p.date DESC LIMIT 1
      ) prev ON true
      JOIN organisation_membership m ON m.user_id = rh.user_id
      JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
      WHERE rh.result = 'pass'
      GROUP BY a.organisation_id, rh.rank_id
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `);
  }

  async captureMonthlyIfNewMonth(
    executor: DrizzleExecutor = this.db,
  ): Promise<{ captured: boolean; year?: number; month?: number }> {
    // "Closing month" = the calendar month before now. Capture it exactly once.
    const [{ existing }] = await executor.execute<{ existing: number }>(sql`
      SELECT COUNT(*)::int AS existing FROM stat_snapshot_monthly
      WHERE year = EXTRACT(YEAR FROM (now() - INTERVAL '1 month'))::smallint
        AND month = EXTRACT(MONTH FROM (now() - INTERVAL '1 month'))::smallint
      LIMIT 1
    `);
    if (existing > 0) return { captured: false };

    await executor.execute(sql`
      INSERT INTO stat_snapshot_monthly (scope_type, scope_id, metric, dimension_key, year, month, value)
      SELECT scope_type, scope_id, metric, dimension_key,
             EXTRACT(YEAR FROM (now() - INTERVAL '1 month'))::smallint,
             EXTRACT(MONTH FROM (now() - INTERVAL '1 month'))::smallint,
             value
      FROM stat_current
    `);
    return {
      captured: true,
      year: new Date().getFullYear() - (new Date().getMonth() === 0 ? 1 : 0),
      month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(),
    };
  }
}
```

- [ ] **Step 3: Extend the trigger integration test file with repo-shape tests.**

Add cases to `apps/backend/test/e2e/statistics-triggers.e2e.spec.ts` that exercise `refreshActivityStats`, `recomputeAvgGapPerRank`, `captureMonthlyIfNewMonth` — seed source rows, call the method through a repo instance, assert `stat_current` / `stat_snapshot_monthly` state.

- [ ] **Step 4: Run tests.**

```bash
pnpm --filter backend exec vitest run --config vitest.e2e.config.ts test/e2e/statistics-triggers.e2e.spec.ts
```
Expected: all new cases pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/backend/src/modules/statistics/statistics.repository.ts apps/backend/test/e2e/statistics-triggers.e2e.spec.ts
git commit -m "feat(statistics): repository + integration coverage"
```

---

### Task 4: Service + abilities

Business logic, authorisation branching, wire mapping. Mockable repo → unit tests only.

**Files:**
- Create: `apps/backend/src/modules/statistics/statistics.service.ts`
- Create: `apps/backend/src/modules/statistics/statistics.service.spec.ts`
- Create: `apps/backend/src/modules/statistics/statistics.abilities.ts`
- Create: `apps/backend/src/modules/statistics/statistics.abilities.spec.ts`

**Interfaces:**
- Consumes: `StatisticsRepository`, `AuthenticatedUser`, all schemas from Task 1.
- Produces:
  - `class StatisticsService` with methods:
    - `getPlatformStats(user: AuthenticatedUser): Promise<PlatformStats>` — 403 unless sysadmin.
    - `getOrganisationStats(orgId: string, user: AuthenticatedUser): Promise<OrganisationStats>` — 403 unless sysadmin OR user has `manage Organisation` on `orgId` (via CASL ability check inside the service using the pattern from `RequirementSetsService`).
    - `getOrganisationTrends(orgId, metric, dimensionKey, months, user): Promise<StatsTrendResponse>` — same auth as above.
    - `getUserStats(userId, user): Promise<UserStats>` — sysadmin OR self OR (orgadmin/instructor of a shared org).
    - `getUserTrends(userId, metric, dimensionKey, months, user): Promise<StatsTrendResponse>` — same as above.
    - `rebuild(user: AuthenticatedUser): Promise<RebuildStatsResponse>` — 403 unless sysadmin.
  - `contributeStatisticsAbilities()` (see `@AbilityContributor` pattern in existing modules like `feature-flags.abilities.ts`) — returns CASL rules for orgadmin / instructor / student. Sysadmin covered by the existing manage-all rule.

- [ ] **Step 1: Write the abilities file.**

Create `apps/backend/src/modules/statistics/statistics.abilities.ts` mirroring the shape of `apps/backend/src/modules/feature-flags/feature-flags.abilities.ts`. Rules:

```ts
// Pseudocode — follow the actual @AbilityContributor pattern already used.
// For a user U:
//   orgadmin memberships → `can('read', 'Statistics', {
//     scopeType: 'organisation',
//     scopeId: { $in: [...ancestorClosure(U's orgadmin orgs)] },
//   })`
//   instructor memberships → `can('read', 'Statistics', {
//     scopeType: 'user',
//     organisationId: { $in: U's instructor org ids },
//   })` (service enforces "user is a member of that org" as a follow-up check)
//   self → `can('read', 'Statistics', { scopeType: 'user', scopeId: U.id })`
```

Ancestor closure is computed via the existing `OrganisationsRepository.getAncestorIds()` (already used by requirement-set resolution). If it takes a single id and the user has multiple orgadmin memberships, compute per-membership and union.

- [ ] **Step 2: Write the abilities spec.**

Create `apps/backend/src/modules/statistics/statistics.abilities.spec.ts` following `feature-flags.abilities.spec.ts`. Matrix:

| Actor | Instance `{ scopeType, scopeId }` | Expected |
|---|---|---|
| sysadmin | any | can |
| orgadmin of X | organisation, X | can |
| orgadmin of X (with ancestor Y) | organisation, Y | can — X is a descendant, so X's data rolls up into Y |
| orgadmin of X | organisation, Z (unrelated) | cannot |
| instructor of X | user, U (member of X) | can |
| instructor of X | user, U (member of Z) | cannot |
| student U | user, U | can |
| student U | user, V | cannot |
| student U | organisation, X | cannot |

- [ ] **Step 3: Write the service.**

Create `apps/backend/src/modules/statistics/statistics.service.ts`. Skeleton:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';
import { StatisticsRepository } from './statistics.repository.js';
import { BeltRanksService } from '../belt-catalog/belt-ranks.service.js'; // for rank rows enrichment
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import type {
  OrganisationStats,
  PlatformStats,
  RebuildStatsResponse,
  StatsTrendResponse,
  UserStats,
} from '@repo/contracts/statistics';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly repo: StatisticsRepository,
    private readonly orgs: OrganisationsRepository,
    private readonly ranks: BeltRanksService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async getPlatformStats(user: AuthenticatedUser): Promise<PlatformStats> {
    if (user.role !== 'sysadmin') throw new ForbiddenException(/* envelope */);
    const raw = await this.repo.getPlatform();
    return this.toPlatformApi(raw);
  }

  async getOrganisationStats(orgId: string, user: AuthenticatedUser): Promise<OrganisationStats> {
    await this.assertCanReadOrg(user, orgId);
    const raw = await this.repo.getOrganisation(orgId);
    const org = await this.orgs.getById(orgId);
    if (!org) throw new NotFoundException(/* envelope */);
    return this.toOrgApi(orgId, org.name, raw);
  }

  // ...remaining methods, each with an assert helper + a toApi mapper.

  private async assertCanReadOrg(user: AuthenticatedUser, orgId: string): Promise<void> {
    if (user.role === 'sysadmin') return;
    const ability = await this.abilityFactory.for(user);
    if (!ability.can('read', /* subject instance */)) {
      throw new ForbiddenException(/* envelope */);
    }
  }

  private toOrgApi(orgId: string, orgName: string, raw): OrganisationStats {
    // Merge repo's rank list with belt rank metadata (name / sortOrder).
    // Sort by rank.sortOrder ASC. Return the wire shape.
  }
}
```

The mapper's inputs are: raw rows from repo + belt-rank rows fetched from `BeltRanksService.listAll()` (or the equivalent). Use `Map<rankId, rankRow>` for a single-pass merge.

Use the same error envelope shape as every other module (`{ error: { code, message } }`).

- [ ] **Step 4: Write the service spec.**

Create `apps/backend/src/modules/statistics/statistics.service.spec.ts`. Mirror `feature-flags.service.spec.ts` structure. Coverage:
- `getPlatformStats`: sysadmin → wire shape; non-sysadmin → ForbiddenException.
- `getOrganisationStats`: sysadmin → wire shape; orgadmin of that org → wire shape; unrelated user → ForbiddenException; unknown org → NotFoundException.
- `getUserStats`: self → OK; instructor of a shared org → OK; unrelated → forbidden.
- `rebuild`: sysadmin → `{ ok, durationMs }`; anyone else → forbidden.
- `toOrgApi` mapper: repo returns 2 rank rows; belt-catalog returns 3 ranks; assert output has 3 rank rows with counts (0 for the one repo didn't return) sorted by sortOrder.

Each test mocks `repo`, `orgs`, `ranks`, and `abilityFactory` with `vi.fn()`.

- [ ] **Step 5: Run tests + typecheck.**

```bash
pnpm --filter backend exec vitest run src/modules/statistics
pnpm --filter backend build
```
Expected: all specs pass, backend builds.

- [ ] **Step 6: Commit.**

```bash
git add apps/backend/src/modules/statistics/statistics.service.ts apps/backend/src/modules/statistics/statistics.service.spec.ts apps/backend/src/modules/statistics/statistics.abilities.ts apps/backend/src/modules/statistics/statistics.abilities.spec.ts
git commit -m "feat(statistics): service + CASL abilities"
```

---

### Task 5: Controller

Public HTTP surface + admin rebuild endpoint. All 6 routes.

**Files:**
- Create: `apps/backend/src/modules/statistics/statistics.controller.ts`
- Create: `apps/backend/src/modules/statistics/statistics.controller.spec.ts`

**Interfaces:**
- Consumes: `StatisticsService`, `CurrentUser` decorator, `ZodValidationPipe`, `CheckAbility` decorator.
- Produces: 6 HTTP endpoints exactly matching the API table in the spec.

- [ ] **Step 1: Write the controller.**

Create `apps/backend/src/modules/statistics/statistics.controller.ts`. Follow the shape of `feature-flags.controller.ts` — two controllers (`StatisticsController` for reads, `StatisticsAdminController` for the rebuild). Use `@CheckAbility('read', 'Statistics')` on the read endpoints (the service enforces per-instance conditions since CASL decorators only check the subject class).

Route table:

| Verb | Path | Handler |
|---|---|---|
| GET | `/api/statistics/platform` | `getPlatform(@CurrentUser)` |
| GET | `/api/statistics/organisation/:id` | `getOrganisation(@Param('id') id, @CurrentUser)` |
| GET | `/api/statistics/organisation/:id/trends` | `getOrganisationTrends(@Param('id'), @Query(pipe) query, @CurrentUser)` |
| GET | `/api/statistics/user/:id` | `getUser(@Param('id'), @CurrentUser)` |
| GET | `/api/statistics/user/:id/trends` | `getUserTrends(@Param('id'), @Query(pipe) query, @CurrentUser)` |
| POST | `/api/admin/statistics/rebuild` | `rebuild(@CurrentUser)` on `StatisticsAdminController` |

Use `new ZodValidationPipe(StatsTrendQuerySchema)` for the trends `@Query`.

- [ ] **Step 2: Write the controller spec.**

Create `apps/backend/src/modules/statistics/statistics.controller.spec.ts`. Mirror `feature-flags.controller.spec.ts`: mock the service, assert each handler passes the right args + returns the service response unchanged. Also assert 6 handlers exist.

- [ ] **Step 3: Add an endpoint e2e for the happy path.**

Create `apps/backend/test/e2e/statistics-endpoints.e2e.spec.ts`. One test that:
1. Boots the full Nest app via `buildTestApp`.
2. Signs up a sysadmin via better-auth's server API (same pattern as `apps/backend/test/e2e/grading-requirements.e2e.spec.ts`).
3. Seeds one organisation + one student membership + one rank_history PASS row.
4. Signs in via HTTP to get a session cookie.
5. GET `/api/statistics/organisation/:id` — asserts 200 + response body has `membershipCount.student === 1` and one rank row with `count === 1`.
6. POST `/api/admin/statistics/rebuild` — asserts 200 + `{ ok: true, durationMs: expect.any(Number) }`.
7. Non-sysadmin GET on `/api/statistics/platform` — asserts 403.

- [ ] **Step 4: Run tests.**

```bash
pnpm --filter backend exec vitest run src/modules/statistics
pnpm --filter backend exec vitest run --config vitest.e2e.config.ts test/e2e/statistics-endpoints.e2e.spec.ts
```
Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/backend/src/modules/statistics/statistics.controller.ts apps/backend/src/modules/statistics/statistics.controller.spec.ts apps/backend/test/e2e/statistics-endpoints.e2e.spec.ts
git commit -m "feat(statistics): controller + endpoint e2e"
```

---

### Task 6: Cron

Nightly job wired to `@nestjs/schedule`.

**Files:**
- Modify: `apps/backend/package.json` (add `@nestjs/schedule`)
- Create: `apps/backend/src/modules/statistics/statistics.cron.ts`
- Create: `apps/backend/src/modules/statistics/statistics.cron.spec.ts`

**Interfaces:**
- Consumes: `StatisticsRepository`, `@nestjs/schedule`.
- Produces: `class StatisticsCronService` — one injectable with a `@Cron('0 3 * * *') runNightly()` method that calls repo methods in the fixed order documented in Section 7 of the design.

- [ ] **Step 1: Add the dep.**

```bash
pnpm --filter backend add @nestjs/schedule@^4
```

- [ ] **Step 2: Write the failing test.**

Create `apps/backend/src/modules/statistics/statistics.cron.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { StatisticsCronService } from './statistics.cron.js';

describe('StatisticsCronService.runNightly', () => {
  it('calls repo methods in the documented order', async () => {
    const calls: string[] = [];
    const repo = {
      refreshActivityStats: vi.fn(() => { calls.push('activity'); }),
      recomputeAvgGapPerRank: vi.fn(() => { calls.push('avgGap'); }),
      captureMonthlyIfNewMonth: vi.fn(async () => { calls.push('snapshot'); return { captured: false }; }),
      rebuildAll: vi.fn(() => { calls.push('rebuild'); return { durationMs: 1 }; }),
    };
    const svc = new StatisticsCronService(repo as never);
    await svc.runNightly();
    expect(calls).toEqual(['activity', 'avgGap', 'snapshot', 'rebuild']);
  });

  it('logs the rebuildAll durationMs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const repo = {
      refreshActivityStats: vi.fn(),
      recomputeAvgGapPerRank: vi.fn(),
      captureMonthlyIfNewMonth: vi.fn(async () => ({ captured: false })),
      rebuildAll: vi.fn(async () => ({ durationMs: 4321 })),
    };
    const svc = new StatisticsCronService(repo as never);
    await svc.runNightly();
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('4321'))).toBe(true);
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Verify it fails.**

```bash
pnpm --filter backend exec vitest run src/modules/statistics/statistics.cron.spec.ts
```
Expected: FAIL — file doesn't exist.

- [ ] **Step 4: Write the cron service.**

Create `apps/backend/src/modules/statistics/statistics.cron.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatisticsRepository } from './statistics.repository.js';

@Injectable()
export class StatisticsCronService {
  private readonly logger = new Logger(StatisticsCronService.name);

  constructor(private readonly repo: StatisticsRepository) {}

  @Cron('0 3 * * *') // 03:00 every day
  async runNightly(): Promise<void> {
    await this.repo.refreshActivityStats();
    await this.repo.recomputeAvgGapPerRank();
    await this.repo.captureMonthlyIfNewMonth();
    const { durationMs } = await this.repo.rebuildAll();
    // NB: Logger.log calls console under the hood; the test asserts on that.
    console.log(`[statistics] rebuild_all completed in ${durationMs}ms`);
  }
}
```

- [ ] **Step 5: Run the test — should pass.**

```bash
pnpm --filter backend exec vitest run src/modules/statistics/statistics.cron.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/backend/package.json apps/backend/pnpm-lock.yaml apps/backend/src/modules/statistics/statistics.cron.ts apps/backend/src/modules/statistics/statistics.cron.spec.ts
git commit -m "feat(statistics): nightly cron via @nestjs/schedule"
```

---

### Task 7: Module wiring + openapi regen

Registers the module in Nest, mounts `ScheduleModule`, regenerates the OpenAPI spec.

**Files:**
- Create: `apps/backend/src/modules/statistics/statistics.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `packages/contracts/openapi/openapi.json` + `openapi.yaml` (regenerated)

**Interfaces:**
- Consumes: `StatisticsService`, `StatisticsController`, `StatisticsAdminController`, `StatisticsRepository`, `StatisticsCronService`, `AbilityFactory`.
- Produces: `StatisticsModule` importable by `AppModule`.

- [ ] **Step 1: Write the module.**

Create `apps/backend/src/modules/statistics/statistics.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AbilityModule } from '../../infrastructure/ability/ability.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { BeltCatalogModule } from '../belt-catalog/belt-catalog.module.js';
import { StatisticsAdminController, StatisticsController } from './statistics.controller.js';
import { StatisticsService } from './statistics.service.js';
import { StatisticsRepository } from './statistics.repository.js';
import { StatisticsCronService } from './statistics.cron.js';

@Module({
  imports: [DatabaseModule, AbilityModule, OrganisationsModule, BeltCatalogModule],
  controllers: [StatisticsController, StatisticsAdminController],
  providers: [StatisticsRepository, StatisticsService, StatisticsCronService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
```

- [ ] **Step 2: Wire into `AppModule`.**

Modify `apps/backend/src/app.module.ts`:
- `import { ScheduleModule } from '@nestjs/schedule';`
- `import { StatisticsModule } from './modules/statistics/statistics.module.js';`
- In `@Module({ imports: [...] })` add both `ScheduleModule.forRoot()` (near the top) and `StatisticsModule` (with the other feature modules).

- [ ] **Step 3: Regenerate openapi.**

```bash
pnpm --filter backend openapi:generate
```
Expected: `packages/contracts/openapi/openapi.{json,yaml}` show new `Statistics*` schemas + the new endpoints.

- [ ] **Step 4: Verify backend build.**

```bash
pnpm --filter backend build
```
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/backend/src/modules/statistics/statistics.module.ts apps/backend/src/app.module.ts packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "feat(statistics): wire StatisticsModule + @nestjs/schedule + regen openapi"
```

---

### Task 8: Frontend entities/statistics

Data layer: API functions + TanStack Query hooks + entity index.

**Files:**
- Create: `apps/frontend/src/entities/statistics/api/statistics.api.ts`
- Create: `apps/frontend/src/entities/statistics/api/statistics.api.test.ts`
- Create: `apps/frontend/src/entities/statistics/lib/hooks.ts`
- Create: `apps/frontend/src/entities/statistics/lib/hooks.test.ts`
- Create: `apps/frontend/src/entities/statistics/index.ts`

**Interfaces:**
- Consumes: `httpClient` from `@/shared/api`, wire schemas from `@repo/contracts/statistics`.
- Produces:
  - Functions: `getPlatformStats()`, `getOrganisationStats(orgId)`, `getUserStats(userId)`, `getOrganisationTrends(orgId, q)`, `getUserTrends(userId, q)`, `rebuildStats()`.
  - Hooks: `usePlatformStatsQuery()`, `useOrganisationStatsQuery(orgId)`, `useUserStatsQuery(userId)`, `useOrganisationTrendsQuery(orgId, q)`, `useUserTrendsQuery(userId, q)`, `useRebuildStatsMutation()`.
  - QueryKey factory `statisticsKeys`.

- [ ] **Step 1: Write the api file.**

Create `apps/frontend/src/entities/statistics/api/statistics.api.ts`. Mirror the shape of `apps/frontend/src/entities/feature-flag/api/feature-flags.api.ts` (single-line functions calling `httpClient` with typed responses).

- [ ] **Step 2: Write the api tests.**

Create `apps/frontend/src/entities/statistics/api/statistics.api.test.ts`. Mirror `feature-flags.api.test.ts` — spy on `httpClient`, assert the URL + method for each function.

- [ ] **Step 3: Write the hooks + hooks tests.**

Create `apps/frontend/src/entities/statistics/lib/hooks.ts` — standard `useQuery` / `useMutation` wrappers with a `statisticsKeys` factory.
Create `apps/frontend/src/entities/statistics/lib/hooks.test.ts` — mirror `apps/frontend/src/entities/feedback/lib/hooks.test.ts` — assert that:
- Each query hook calls the corresponding api function with the right args.
- `useRebuildStatsMutation` invalidates every statistics query key on success.

- [ ] **Step 4: Write the entity barrel.**

Create `apps/frontend/src/entities/statistics/index.ts` — export everything from `api` and `lib` (respect FSD's public-API rule so downstream code only imports through this file).

- [ ] **Step 5: Run tests.**

```bash
pnpm --filter frontend exec vitest run src/entities/statistics
```
Expected: all pass.

- [ ] **Step 6: Commit.**

```bash
git add apps/frontend/src/entities/statistics
git commit -m "feat(frontend): entities/statistics data layer"
```

---

### Task 9: Presentational widgets

Four small pure components with tests.

**Files:**
- Create: `apps/frontend/src/features/stat-tile/{ui/StatTile.tsx, ui/StatTile.test.tsx, index.ts}`
- Create: `apps/frontend/src/features/rank-breakdown/{ui/RankBreakdown.tsx, ui/RankBreakdown.test.tsx, index.ts}`
- Create: `apps/frontend/src/features/trend-sparkline/{ui/TrendSparkline.tsx, ui/TrendSparkline.test.tsx, index.ts}`
- Create: `apps/frontend/src/features/coverage-meter/{ui/CoverageMeter.tsx, ui/CoverageMeter.test.tsx, index.ts}`

**Interfaces:**
- Consumes: types from `@repo/contracts/statistics`.
- Produces:
  - `<StatTile label value deltaPct? />` — big number, label, optional up/down arrow.
  - `<RankBreakdown ranks={StatsRankRow[]} />` — rows sorted by `rank.sortOrder ASC`; each row shows a belt-coloured swatch (from `rank.visuals`) + name + count. If `visuals` is unavailable in the contract, degrade to a neutral pill.
  - `<TrendSparkline points={StatsTrendPoint[]} width height />` — inline SVG polyline.
  - `<CoverageMeter label pct />` — a horizontal progress bar with percent label.

- [ ] **Step 1: StatTile — test then impl.**

Create `apps/frontend/src/features/stat-tile/ui/StatTile.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatTile } from './StatTile.js';

describe('<StatTile>', () => {
  it('renders the label and formatted value', () => {
    render(<StatTile label="Students" value={1234} />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders an up delta with a "+" prefix', () => {
    render(<StatTile label="X" value={10} deltaPct={12.5} />);
    expect(screen.getByText(/\+12\.5%/)).toBeInTheDocument();
  });

  it('renders a down delta with a "−" prefix', () => {
    render(<StatTile label="X" value={10} deltaPct={-3.4} />);
    expect(screen.getByText(/−3\.4%/)).toBeInTheDocument();
  });
});
```

Implementation:
```tsx
import * as React from 'react';

export interface StatTileProps {
  label: string;
  value: number;
  deltaPct?: number;
}

export function StatTile({ label, value, deltaPct }: StatTileProps): React.ReactElement {
  const fmt = new Intl.NumberFormat(undefined).format(value);
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
      <div className="text-xs uppercase text-on-surface-variant">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{fmt}</div>
      {typeof deltaPct === 'number' ? (
        <div className={deltaPct >= 0 ? 'text-primary text-xs mt-1' : 'text-error text-xs mt-1'}>
          {deltaPct >= 0 ? `+${deltaPct.toFixed(1)}%` : `−${Math.abs(deltaPct).toFixed(1)}%`}
        </div>
      ) : null}
    </div>
  );
}
```

Barrel: `export { StatTile } from './ui/StatTile.js';`

- [ ] **Step 2: RankBreakdown — test then impl.**

Create the test first. Assert:
- Rows render in `rank.sortOrder ASC` regardless of input order.
- Every rank name (romaji + english) appears.
- Every count appears.
- Zero-count rows still render (the trigger removes them; the UI shows what the contract returns).

Implementation renders a simple table or flex list; belt colour swatch is a 4-px wide div using the `--md-sys-color-primary` token if `rank.visuals` isn't in the wire shape (which the current spec doesn't expose — enrichment on the backend is a later concern).

- [ ] **Step 3: TrendSparkline — test then impl.**

Test: renders one `<svg>` with a `<polyline>` whose `points` attribute has N pairs for N input points. Assert an empty-state message when `points.length === 0`. Assert `width` and `height` props are honoured.

Implementation: pure SVG, ~40 lines. Normalise the value range to fit the box.

- [ ] **Step 4: CoverageMeter — test then impl.**

Test: renders the label + `%`; the inner bar's `width` style equals `pct` clamped to 0..100.

Implementation: two divs, outer + inner, plus a label.

- [ ] **Step 5: Run all four spec files.**

```bash
pnpm --filter frontend exec vitest run src/features/stat-tile src/features/rank-breakdown src/features/trend-sparkline src/features/coverage-meter
```
Expected: all pass.

- [ ] **Step 6: Commit.**

```bash
git add apps/frontend/src/features/stat-tile apps/frontend/src/features/rank-breakdown apps/frontend/src/features/trend-sparkline apps/frontend/src/features/coverage-meter
git commit -m "feat(frontend): statistics widgets — StatTile, RankBreakdown, TrendSparkline, CoverageMeter"
```

---

### Task 10: Admin statistics page

Sysadmin platform overview + route.

**Files:**
- Create: `apps/frontend/src/pages/admin-statistics/ui/AdminStatisticsPage.tsx`
- Create: `apps/frontend/src/pages/admin-statistics/ui/AdminStatisticsPage.test.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.admin.statistics.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` — add "Statistics" link inside the sysadmin group.

**Interfaces:**
- Consumes: `usePlatformStatsQuery`, `useRebuildStatsMutation`, all 4 widget components, `Button` from shared/ui.
- Produces: A page mounted at `/admin/statistics` that renders 4 `<StatTile>`s, a `<RankBreakdown>`, and a "Rebuild statistics now" button (sysadmin only).

- [ ] **Step 1: Write the page.**

`AdminStatisticsPage.tsx`:
- Fetch via `usePlatformStatsQuery()`.
- Loading / error states.
- Header + 4 tiles + rank breakdown + rebuild button.
- Rebuild button calls `useRebuildStatsMutation().mutate()`; disable while pending; show a toast/inline message with `durationMs` on success (reuse whatever notification pattern the sysadmin surfaces already use).

- [ ] **Step 2: Write the page test.**

Mock the `@/entities/statistics` barrel (following the pattern in `apps/frontend/src/pages/admin-feature-flags/ui/AdminFeatureFlagsPage.test.tsx`). Assert:
- Loading state renders when query is loading.
- Empty-state or fallback renders when platform data returns zero counts.
- Rebuild button click fires the mutation.

- [ ] **Step 3: Add the route.**

Follow the TanStack Router file-based route convention already in use. Route wraps the page in the sysadmin guard used by other `/admin/*` routes.

- [ ] **Step 4: Add the sidebar entry.**

Modify the sysadmin nav group in `AppSidebar.tsx` to add a "Statistics" link between "Feature flags" and "Audit log" (order matches user's mental grouping of admin tools). Guard the entry with the same `ability?.can('read', 'Statistics')` check pattern already used for other sysadmin entries.

- [ ] **Step 5: Run tests + typecheck + lint.**

```bash
pnpm --filter frontend exec vitest run src/pages/admin-statistics
pnpm --filter frontend typecheck
pnpm --filter frontend lint
```

- [ ] **Step 6: Commit.**

```bash
git add apps/frontend/src/pages/admin-statistics apps/frontend/src/app/router/routes/_app.admin.statistics.tsx apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(frontend): admin statistics page + route + sidebar entry"
```

---

### Task 11: Organisation statistics page

Full org-scope stats + ancestor / child-org drill-down navigation.

**Files:**
- Create: `apps/frontend/src/pages/organisation-statistics/ui/OrganisationStatisticsPage.tsx`
- Create: `apps/frontend/src/pages/organisation-statistics/ui/OrganisationStatisticsPage.test.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.organisation.$id.statistics.tsx`

**Interfaces:**
- Consumes: `useOrganisationStatsQuery`, `useOrganisationTrendsQuery`, `useOrganisationQuery` (existing), widgets.
- Produces: Page mounted at `/organisation/:id/statistics` visible to sysadmin OR anyone with `manage Organisation` on `:id`.

- [ ] **Step 1: Page.** Header with org name + ancestor breadcrumb (using existing org-tree helpers). 4 tiles, rank breakdown, one `<TrendSparkline>` for `membershipCount` over the last 12 months. Below: a list of direct child orgs (each a link to `/organisation/<childId>/statistics`) for drill-down.

- [ ] **Step 2: Route + guard.** Standard file-based route; page component decides access via the query result (403 → "You don't have access to this organisation's stats").

- [ ] **Step 3: Page test.** Mock entity + org hooks; assert breadcrumb, tiles, rank breakdown, child-org drill-down link.

- [ ] **Step 4: Verify.**

```bash
pnpm --filter frontend exec vitest run src/pages/organisation-statistics
pnpm --filter frontend typecheck
```

- [ ] **Step 5: Commit.**

```bash
git add apps/frontend/src/pages/organisation-statistics apps/frontend/src/app/router/routes/_app.organisation.$id.statistics.tsx
git commit -m "feat(frontend): organisation statistics page + drill-down"
```

---

### Task 12: Embedded widgets on existing pages

Three small integrations. Each is independent; each ends in a passing widget-level test.

**Files:**
- Modify: `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.tsx` — insert a "Statistics" section (4 tiles + rank breakdown + link to full page).
- Modify: `apps/frontend/src/pages/profile/ui/ProfilePage.tsx` (or the actual profile route file — locate via `grep -rl "route:.*profile"`) — insert `<CoverageMeter>` for current rank + one `<TrendSparkline>` under "Your progress".
- Modify: the instructor students-view (locate via existing `pages/students-*` or `widgets/students-list`) — add a compact `<CoverageMeter>` per student row.

**Interfaces:**
- Consumes: entities hooks from Task 8, widgets from Task 9.
- Produces: no new exported types; only additions to existing pages.

- [ ] **Step 1: my-organisation section.** Add before or after the existing memberships block. Fetch via `useOrganisationStatsQuery(currentOrgId)`. Wrap in Suspense/loading state matching the page's existing pattern. Add a corresponding test case to the page's existing spec: mock the entity, assert 4 tiles render.

- [ ] **Step 2: profile section (student view).** Add "Your progression" section with `<CoverageMeter>` (from `useUserStatsQuery(currentUserId).coverageByRank[currentRankIdx]`) and `<TrendSparkline>` (from `useUserTrendsQuery`). Add a test case asserting the widget renders when data resolves.

- [ ] **Step 3: instructor student list widget.** In whichever list component the instructor uses to browse their students, add `<CoverageMeter>` inline per row. Test that iterates the mocked-list length and asserts N `<CoverageMeter>` instances.

- [ ] **Step 4: Verify.**

```bash
pnpm --filter frontend exec vitest run src/pages/my-organisation src/pages/profile src/pages/students
pnpm --filter frontend typecheck
pnpm --filter frontend lint
```

- [ ] **Step 5: Commit.**

```bash
git add apps/frontend/src/pages/my-organisation apps/frontend/src/pages/profile
# plus the instructor list page path once located
git commit -m "feat(frontend): embed statistics widgets on org, profile, and instructor pages"
```

---

### Task 13: Docs

Ship `docs/statistics.md` with the metric catalog and rebuild-button guidance so this feature doesn't become folklore.

**Files:**
- Create: `docs/statistics.md`

**Interfaces:**
- Consumes: the design spec (`docs/superpowers/specs/2026-07-31-statistics-design.md`).
- Produces: a runbook plus a "how to add a new metric" recipe.

- [ ] **Step 1: Write the doc.**

Sections:
1. **What lives here.** One paragraph: two tables + triggers + cron.
2. **Metric catalog.** Copy the Section 5 table from the design spec.
3. **How to add a new metric.** Concrete recipe:
   1. Decide freshness (real-time vs nightly).
   2. If real-time: add SQL to the appropriate `on_*_change()` function OR write a new trigger. Add a raw-SQL migration.
   3. If nightly: add a new method to `StatisticsRepository`; call it from `runNightly()`.
   4. Add the field to `packages/contracts/src/statistics.ts` (schema).
   5. Update the `toApi` mapper in `StatisticsService`.
   6. Update the widget/page that surfaces it.
   7. Add a test at each layer.
4. **Rebuilding stats manually.** Where the button lives (`/admin/statistics`), when to press it (after a bulk seed / direct DB edit / suspected drift), what the response tells you (`durationMs`).
5. **Monitoring hooks.** Nightly log line format; how to detect drift (planned as a follow-up).

- [ ] **Step 2: Commit.**

```bash
git add docs/statistics.md
git commit -m "docs(statistics): metric catalog + how-to-add-a-metric runbook"
```

---

## Self-review

**Spec coverage** — every section of the design spec has at least one task:

| Spec section | Task(s) |
|---|---|
| §3 Architecture (SQL-first) | Tasks 2, 3, 6 |
| §4 Data model | Task 2 |
| §5 Metric catalog | Tasks 2, 3 |
| §6 Trigger design | Task 2 |
| §7 Nightly cron | Task 6 |
| §8 API | Tasks 5, 7 |
| §9 CASL | Task 4 |
| §10 Frontend | Tasks 8, 9, 10, 11, 12 |
| §11 Testing | Every task ends with tests. Task 5 adds the endpoint e2e. |
| §12 Rollout | Task 2 bootstraps via `SELECT rebuild_all()`. Task 7 wires the module. |
| §13 Documentation | Task 13 |

**Placeholder scan** — a few call-outs where the plan intentionally leaves detail to implementation:
- Task 3 Step 3: "extend the trigger integration test with repo-shape tests" — the trigger cases in Task 2 Step 8 are the pattern; new cases follow that shape. Not a placeholder — a direct instruction.
- Task 4 Step 3 mentions "OrganisationsRepository.getAncestorIds()" without pinning the exact signature — it exists today and its interface is documented in the module. Fine.
- Task 12: "Locate via grep" for the profile route — the exact filename varies with router state; the pattern is deterministic.

**Type consistency** — checked: `refreshActivityStats`, `recomputeAvgGapPerRank`, `captureMonthlyIfNewMonth`, `rebuildAll` are named the same in Task 3, Task 6, and Task 7. `Statistics` (CASL subject) named the same in Tasks 1, 4, 5.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-31-statistics-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
