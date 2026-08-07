# Statistics cleanup — PR1 (Backend correctness + test coverage)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Small backend correctness fixes + missing test coverage flagged during PR #88's final review and per-task reviews.

**Architecture:** Six independent tasks. Task 3 adds a new SQL migration (0034); the other five modify existing TypeScript files with no behaviour change to shipped functionality.

**Tech Stack:** NestJS + Drizzle + Postgres + Vitest.

## Global Constraints

- **Never edit `apps/backend/drizzle/0033_statistics_triggers.sql`** — migrations are immutable once shipped. Additive fixes go in a new numbered migration.
- **Error envelope shape** `{ error: { code, message } }` — matches the rest of the codebase.
- **Numeric casts** — DB values come back as strings via postgres-js; every read is `Number(row.value)`. Any new SQL that materialises to JS goes through the same coercion.

---

### Task 1: Remove unused `StatsScopeSchema`

**Files:**
- Modify: `packages/contracts/src/statistics.ts`
- Modify: `packages/contracts/src/__tests__/statistics.test.ts` (drop the two `StatsScopeSchema` cases)

**Interfaces:**
- Consumes: nothing
- Produces: contract exports minus `StatsScopeSchema` and `type StatsScope`. Downstream code doesn't consume either — grepped and confirmed no `entities/statistic` or page import references them.

**Rationale:** The schema was exported and OpenAPI-registered but each of `PlatformStatsSchema` / `OrganisationStatsSchema` / `UserStatsSchema` redefines its own scope object inline. Making them reuse arms of `StatsScopeSchema` would require restructuring the wire shape (discriminated union at the top-level `scope` field) which the frontend consumers aren't prepared for. Simpler + honest: delete the unused export. If a future caller needs a runtime scope validator, it can be reintroduced then, matching the actual shape then.

- [ ] **Step 1: Delete the schema + type export**

Open `packages/contracts/src/statistics.ts`. Remove the `StatsScopeSchema` declaration and its `type StatsScope = z.infer<typeof StatsScopeSchema>` export line. Also remove `StatsScope: StatsScopeSchema` from `StatisticsOpenApiRegistry`.

- [ ] **Step 2: Remove the two schema tests**

In `packages/contracts/src/__tests__/statistics.test.ts`, delete the two `describe('StatsScopeSchema', ...)` cases.

- [ ] **Step 3: Rebuild contracts + run tests**

Run:
```bash
pnpm --filter @repo/contracts build
pnpm --filter @repo/contracts test
```
Expected: build clean, 195/195 (or whatever count minus 2) pass.

- [ ] **Step 4: Verify backend typecheck still clean**

Run: `pnpm --filter backend build`
Expected: exit 0. If it fails on a `StatsScope` reference in the backend, that reference was live and should be re-inlined; leave the schema in place instead and update task 1 to be a no-op.

- [ ] **Step 5: Regenerate openapi + verify no schema drift**

Run: `pnpm --filter backend openapi:generate`
Expected: `git diff packages/contracts/openapi/` shows only the removal of the `StatsScope` component definition (~10 lines removed). No other endpoints touched.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/statistics.ts packages/contracts/src/__tests__/statistics.test.ts packages/contracts/openapi/
git commit -m "chore(contracts): remove unused StatsScopeSchema"
```

---

### Task 2: Normalize numeric casts in `captureMonthlyIfNewMonth`

**Files:**
- Modify: `apps/backend/src/modules/statistics/statistics.repository.ts`

**Interfaces:**
- Consumes: nothing
- Produces: no functional change; internal SQL casts consistent

**Rationale:** The existence-guard uses `::smallint`, the INSERT uses `::smallint`, but the read-back query uses `::int` — same values reached three ways with two different types. Not a bug (Postgres widens `smallint` → `int` freely) but reads as accidental.

- [ ] **Step 1: Grep for the mismatched cast**

Open `statistics.repository.ts`, search for `captureMonthlyIfNewMonth`. Find the three EXTRACT expressions:
- Existence guard (~line 342): `EXTRACT(YEAR FROM ...)::smallint`, `EXTRACT(MONTH FROM ...)::smallint`
- INSERT (~line 352): same `::smallint`
- Read-back (~line 359): `EXTRACT(YEAR FROM ...)::int`, `EXTRACT(MONTH FROM ...)::int`

- [ ] **Step 2: Change the read-back to `::smallint`**

Replace the two `::int` casts on the read-back query with `::smallint`. This matches the column type on `stat_snapshot_monthly.year` and `.month` and makes the three sites read identically.

- [ ] **Step 3: Run the integration test**

Run: `pnpm --filter backend exec vitest run --config vitest.e2e.config.ts test/e2e/statistics-triggers.e2e.spec.ts -t "captureMonthlyIfNewMonth"`
Expected: pass (needs local Postgres via `pnpm --filter backend db:dev:up` if not already running).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/statistics/statistics.repository.ts
git commit -m "chore(statistics): normalize year/month casts to ::smallint"
```

---

### Task 3: Add unique constraint on `stat_snapshot_monthly` (new migration)

**Files:**
- Create: `apps/backend/drizzle/0034_stat_snapshot_unique.sql`
- Modify: `apps/backend/drizzle/meta/_journal.json` (add the 0034 entry)
- Copy: `apps/backend/drizzle/meta/0033_snapshot.json` → `apps/backend/drizzle/meta/0034_snapshot.json` (no Drizzle schema shape change; only DB-level constraint)
- Modify: `apps/backend/src/modules/statistics/statistics.repository.ts` — the INSERT in `captureMonthlyIfNewMonth` gains an `ON CONFLICT DO NOTHING` clause matching the new constraint

**Interfaces:**
- Consumes: existing tables
- Produces: `stat_snapshot_monthly_scope_metric_dim_year_month_key` unique index

**Rationale:** `stat_snapshot_monthly` has a composite PK but the current INSERT has no `ON CONFLICT` — safe today because the cron runs once per node and the existence-guard prevents re-entry within a run. A double-invocation (e.g. two nodes accidentally running the cron) would fail with a PK violation and abort the whole nightly run.

**Note on the PK:** `stat_snapshot_monthly` PK is already `(scope_type, scope_id, metric, dimension_key, year, month)`. That IS the unique constraint we need — no new index needed. Task 3 is therefore ONLY the `ON CONFLICT` clause in the INSERT.

**Revised scope: no new migration needed** — the PK already enforces uniqueness. Only step needed:

- [ ] **Step 1: Add `ON CONFLICT DO NOTHING` to the INSERT**

In `captureMonthlyIfNewMonth`'s INSERT SQL, append `ON CONFLICT DO NOTHING`. This makes the operation idempotent under any accidental double-invocation — no PK violation aborts the run.

- [ ] **Step 2: Test the idempotency**

Add to `statistics-triggers.e2e.spec.ts` (or wherever the `captureMonthlyIfNewMonth` test lives):

```ts
it('is idempotent under double invocation', async () => {
  // Seed one stat_current row.
  await db.execute(sql`
    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value)
    VALUES ('platform', '__platform__', 'membership_count', 'student', 42)
    ON CONFLICT DO NOTHING;
  `);

  // Advance the clock so "previous month" resolves to a snapshot-able month.
  // (If the test already fakes time or seeds a snapshot from a prior month,
  // reuse that setup — otherwise the second call is a no-op via the existence
  // guard, and this test needs to force the guard to see zero.)

  const first = await repo.captureMonthlyIfNewMonth();
  const second = await repo.captureMonthlyIfNewMonth();

  expect(first.captured).toBe(true);
  expect(second.captured).toBe(false);  // guard sees a row now
  // No PK violation thrown.
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter backend exec vitest run --config vitest.e2e.config.ts test/e2e/statistics-triggers.e2e.spec.ts -t "idempotent"`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/statistics/statistics.repository.ts apps/backend/test/e2e/statistics-triggers.e2e.spec.ts
git commit -m "fix(statistics): make monthly snapshot INSERT idempotent"
```

---

### Task 4: Reconcile 403/404 precedence — `assertCanReadUser` follows `assertCanReadOrg`

**Files:**
- Modify: `apps/backend/src/modules/statistics/statistics.service.ts`
- Modify: `apps/backend/src/modules/statistics/statistics.service.spec.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `assertCanReadUser` now throws 403 before 404 when both would fire (matching `assertCanReadOrg`)

**Rationale:** Two callers, two orderings — inconsistent. Pick 403-first-then-404 as the canonical order:
- Consistent within the module.
- Reveals less information (a well-behaved 404 tells an unauthorized caller which IDs exist; 403-first hides that).
- Matches the codebase's dominant idiom (grep confirms most existing services do auth first).

- [ ] **Step 1: Write the failing test**

Add to `statistics.service.spec.ts`:

```ts
it('throws 403 before 404 when caller is unauthorized AND user does not exist', async () => {
  const caller = /* build a non-sysadmin user without any relevant memberships */;
  usersRepoMock.findById.mockResolvedValue(null);  // user does not exist

  await expect(service.getUserStats('missing-id', caller))
    .rejects.toThrow(ForbiddenException);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/statistics/statistics.service.spec.ts -t "403 before 404"`
Expected: FAIL — current code throws `NotFoundException` because it fetches the user first.

- [ ] **Step 3: Rework `assertCanReadUser` to check auth first**

In `statistics.service.ts`, find `assertCanReadUser`. Move the auth branches (sysadmin short-circuit, self-check, CASL check with instance conditions) BEFORE the `orgsForTarget` / `usersRepo.findById(userId)` calls. If the caller is authorized to read ANY user's stats (sysadmin), proceed to the fetch; otherwise for non-sysadmin, do the following:

1. If `caller.id === userId`, allow (self-read).
2. Otherwise fetch the target's memberships and the caller's ability rules; run the CASL check per-instance. If DENIED, throw `ForbiddenException`.
3. Only after all auth branches pass, THEN fetch the target user for existence check. If not found, throw `NotFoundException`.

Update the doc comment above the method:

```ts
/**
 * 403 before 404. Consistent with assertCanReadOrg — reveals less
 * information about existence to unauthorized callers.
 */
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter backend exec vitest run src/modules/statistics/statistics.service.spec.ts`
Expected: the new "403 before 404" test passes; all existing tests still pass. Any test that was asserting `NotFoundException` for a non-sysadmin + missing-user scenario needs to be updated to expect `ForbiddenException` — treat that as intentional (the new precedence is the fix).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/statistics/statistics.service.ts apps/backend/src/modules/statistics/statistics.service.spec.ts
git commit -m "fix(statistics): assertCanReadUser checks auth before existence (403 before 404)"
```

---

### Task 5: `Date(0)` regression tests for `toPlatformApi` + `toOrgApi`

**Files:**
- Modify: `apps/backend/src/modules/statistics/statistics.service.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: two new test cases

**Rationale:** Task 3 introduced a `Date(0)` sentinel in the repo (returned when there are no stat rows for a scope). The service's `resolveUpdatedAt` maps that sentinel to `new Date()` before returning to the caller. Task 4 shipped a regression test for `toUserApi` but not for the other two mappers that use the same helper — trivial to add symmetric coverage.

- [ ] **Step 1: Add two tests to `statistics.service.spec.ts`**

```ts
describe('toPlatformApi Date(0) sentinel', () => {
  it('maps Date(0) from the repo to a recent timestamp', async () => {
    repoMock.getPlatform.mockResolvedValue({
      metrics: { /* zeros */ },
      ranks: [],
      updatedAt: new Date(0),
    });

    const before = Date.now();
    const result = await service.getPlatformStats(sysadmin);
    const after = Date.now();

    expect(new Date(result.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(result.updatedAt).getTime()).toBeLessThanOrEqual(after);
  });
});

describe('toOrgApi Date(0) sentinel', () => {
  it('maps Date(0) from the repo to a recent timestamp', async () => {
    repoMock.getOrganisation.mockResolvedValue({
      metrics: { /* zeros */ },
      ranks: [],
      updatedAt: new Date(0),
    });
    // orgs.findById returns a real org
    orgsMock.findById.mockResolvedValue(fakeOrg);

    const before = Date.now();
    const result = await service.getOrganisationStats(fakeOrg.id, sysadmin);
    const after = Date.now();

    expect(new Date(result.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(result.updatedAt).getTime()).toBeLessThanOrEqual(after);
  });
});
```

Fill in the `fakeOrg` and empty metrics blocks based on the shape of existing tests in the same file — grep for `getPlatform.mockResolvedValue` to find a reference.

- [ ] **Step 2: Run tests**

Run: `pnpm --filter backend exec vitest run src/modules/statistics/statistics.service.spec.ts -t "Date(0) sentinel"`
Expected: 2/2 pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/statistics/statistics.service.spec.ts
git commit -m "test(statistics): Date(0) sentinel regression for platform + org mappers"
```

---

### Task 6: `getUserTrends` forbidden test

**Files:**
- Modify: `apps/backend/src/modules/statistics/statistics.service.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: one new test case

**Rationale:** `getUserTrends` reuses `assertCanReadUser` so the forbidden path is transitively covered, but a direct test pins the contract at the API-relevant method rather than relying on the shared helper's coverage.

- [ ] **Step 1: Add the test**

```ts
describe('getUserTrends authorization', () => {
  it('throws ForbiddenException for an unrelated caller', async () => {
    const targetUser = 'student-42';
    const unrelatedCaller = /* build a non-sysadmin, non-self, non-org-adjacent user */;
    // Target exists and is in some org the caller does NOT administer.
    usersRepoMock.findById.mockResolvedValue({ id: targetUser, role: 'user' });
    membershipsRepoMock.findByUserId.mockResolvedValue([
      { userId: targetUser, organisationId: 'org-target', role: 'student' },
    ]);

    await expect(
      service.getUserTrends(
        targetUser,
        { metric: 'content_coverage_pct', dimensionKey: 'some-rank-id', months: 12 },
        unrelatedCaller,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter backend exec vitest run src/modules/statistics/statistics.service.spec.ts -t "getUserTrends"`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/statistics/statistics.service.spec.ts
git commit -m "test(statistics): getUserTrends forbidden path"
```

---

## Wrap-up

6 commits, all backend/contracts. Push and open one PR.

```bash
git push -u origin chore/stats-cleanup-backend
gh pr create --base main --title "chore(statistics): backend correctness + test-coverage cleanup" ...
```
