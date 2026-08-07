# Statistics cleanup — PR3 (Cross-cutting DX)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicated "highest-`sortOrder` rank" reducer + inline type workaround between `ProfilePage` and `StudentsPage`. Extract to a shared helper in `entities/statistic` and export the type from `@repo/contracts/statistics`.

**Architecture:** Two tasks — first ship the shared helper + type export (foundation), then migrate the two consumers to use them. Doing it in two commits keeps each reviewable.

**Tech Stack:** TypeScript + Zod (contracts) + React (consumer pages).

## Global Constraints

- **No behaviour change** — same "current rank" resolution rule (highest `sortOrder` in `coverageByRank`), same fallback (empty array → `undefined`).
- **FSD:** the helper lives in `entities/statistic/lib/` and is exported through the entity barrel. Pages import it via the barrel; no reaching into deep paths.
- **Type export:** `UserStatsRankCoverage` becomes a first-class export of `@repo/contracts/statistics` (currently only reachable as `UserStats['coverageByRank'][number]`).

---

### Task 1: Export `UserStatsRankCoverage` type + add `currentRank` helper

**Files:**
- Modify: `packages/contracts/src/statistics.ts` — one new `export type` line
- Create: `apps/frontend/src/entities/statistic/lib/currentRank.ts` — the helper
- Create: `apps/frontend/src/entities/statistic/lib/currentRank.test.ts` — its tests
- Modify: `apps/frontend/src/entities/statistic/index.ts` — barrel re-export

**Interfaces:**
- Consumes: `UserStatsRankCoverage` from `@repo/contracts/statistics`
- Produces:
  - `import { type UserStatsRankCoverage } from '@repo/contracts/statistics'`
  - `import { currentRank } from '@/entities/statistic'`
  - Signature: `function currentRank(coverage: readonly UserStatsRankCoverage[]): UserStatsRankCoverage | undefined`
  - Returns the coverage entry with the highest `rank.sortOrder`, or `undefined` if the array is empty.

- [ ] **Step 1: Export the type from contracts**

In `packages/contracts/src/statistics.ts`, near the other `export type` lines (after `StatsRankRow`, etc.), add:

```ts
/** Convenience type for a single row of UserStats.coverageByRank. */
export type UserStatsRankCoverage = z.infer<typeof UserStatsRankCoverageSchema>;
```

The schema `UserStatsRankCoverageSchema` should already exist (it's referenced in `UserStatsSchema.coverageByRank: UserStatsRankCoverageSchema.array()`). If it's inline instead of extracted, extract it as a named schema first, then infer the type from it.

- [ ] **Step 2: Rebuild contracts**

Run: `pnpm --filter @repo/contracts build`
Expected: `dist/statistics.d.ts` gains the `UserStatsRankCoverage` export.

- [ ] **Step 3: Write the failing test for `currentRank`**

Create `apps/frontend/src/entities/statistic/lib/currentRank.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UserStatsRankCoverage } from '@repo/contracts/statistics';
import { currentRank } from './currentRank.js';

function coverage(sortOrder: number, id = `r-${sortOrder}`): UserStatsRankCoverage {
  return {
    rank: {
      id,
      slug: `rank-${sortOrder}`,
      nameRomaji: `rank-${sortOrder}`,
      nameEn: `Rank ${sortOrder}`,
      nameSv: `Grad ${sortOrder}`,
      nameFi: `Aste ${sortOrder}`,
      nameJa: null,
      belt: null,
      sortOrder,
    },
    coveragePct: 50,
    updatedAt: new Date().toISOString(),
  };
}

describe('currentRank', () => {
  it('returns undefined for an empty array', () => {
    expect(currentRank([])).toBeUndefined();
  });

  it('returns the single row when the array has one', () => {
    const row = coverage(10);
    expect(currentRank([row])).toBe(row);
  });

  it('returns the row with the highest sortOrder', () => {
    const lo = coverage(5, 'lo');
    const mid = coverage(10, 'mid');
    const hi = coverage(20, 'hi');
    expect(currentRank([lo, hi, mid])).toBe(hi);
  });

  it('is stable when two rows share the highest sortOrder (returns first match)', () => {
    // Not a strong guarantee — but pin the behaviour so callers aren't
    // surprised by an implementation change.
    const a = coverage(10, 'a');
    const b = coverage(10, 'b');
    expect(currentRank([a, b])).toBe(a);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/entities/statistic/lib/currentRank`
Expected: FAIL — file doesn't exist yet.

- [ ] **Step 5: Implement the helper**

Create `apps/frontend/src/entities/statistic/lib/currentRank.ts`:

```ts
import type { UserStatsRankCoverage } from '@repo/contracts/statistics';

/**
 * Pick the "current" rank from a user's coverage rows — the row with the
 * highest `rank.sortOrder`. Returns undefined for empty input.
 *
 * Extracted from ProfilePage / StudentsPage which both used the same
 * `reduce` inline. Same tie-break behaviour as the original (first match
 * on equal sortOrder).
 */
export function currentRank(
  coverage: readonly UserStatsRankCoverage[],
): UserStatsRankCoverage | undefined {
  return coverage.reduce<UserStatsRankCoverage | undefined>(
    (acc, row) => (acc === undefined || row.rank.sortOrder > acc.rank.sortOrder ? row : acc),
    undefined,
  );
}
```

- [ ] **Step 6: Re-export via the entity barrel**

Open `apps/frontend/src/entities/statistic/index.ts`. Add:

```ts
export { currentRank } from './lib/currentRank.js';
```

Also add (or verify) the type re-export from contracts:

```ts
export type { UserStatsRankCoverage } from '@repo/contracts/statistics';
```

(If the entity's barrel already re-exports other statistics wire types, add this one next to them.)

- [ ] **Step 7: Run tests**

Run: `pnpm --filter frontend exec vitest run src/entities/statistic`
Expected: all pass (existing hooks/api tests + new `currentRank` tests).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/statistics.ts packages/contracts/openapi/ apps/frontend/src/entities/statistic
git commit -m "feat(statistic): shared currentRank helper + UserStatsRankCoverage type export"
```

If the openapi spec changed because `UserStatsRankCoverageSchema` moved from inline to named, regenerate it with `pnpm --filter backend openapi:generate` and include that in the same commit.

---

### Task 2: Migrate `ProfilePage` + `StudentsPage` to use the helper

**Files:**
- Modify: `apps/frontend/src/pages/profile/ui/ProfilePage.tsx`
- Modify: `apps/frontend/src/pages/students/ui/StudentsPage.tsx`
- Verify (no change expected): `apps/frontend/src/pages/profile/ui/ProfilePage.test.tsx`, `apps/frontend/src/pages/students/ui/StudentsPage.test.tsx`

**Interfaces:**
- Consumes: `currentRank` and `UserStatsRankCoverage` from `@/entities/statistic`
- Produces: no external behaviour change

- [ ] **Step 1: `ProfilePage` — replace inline reduce**

In `ProfilePage.tsx`:

1. Remove the inline `UserStatsRankCoverage` type workaround (`UserStats['coverageByRank'][number]` — if used).
2. Import `currentRank` and (if the type is used locally) `UserStatsRankCoverage` from `@/entities/statistic`.
3. Replace the existing inline reduce (looks like `data.coverageByRank.reduce((best, row) => ..., undefined as UserStatsRankCoverage | undefined)`) with:

```ts
const rank = currentRank(data.coverageByRank);
```

Keep the surrounding null-guards (`if (!rank) return null;` etc.) unchanged. `useUserTrendsQuery(..., { enabled: !!rank })` continues to gate on the derived value.

- [ ] **Step 2: `StudentsPage` — same swap in `StudentCoverageCell`**

In `StudentsPage.tsx` (specifically the per-row `StudentCoverageCell` inner component), do the same replacement. Same import, same call site.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter frontend exec vitest run src/pages/profile src/pages/students`
Expected: all pass unchanged. The extracted helper has the same behaviour as the inline reduces, so no test change should be needed.

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
pnpm --filter frontend typecheck
pnpm --filter frontend lint apps/frontend/src/pages/profile apps/frontend/src/pages/students
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/profile apps/frontend/src/pages/students
git commit -m "refactor(pages): use shared currentRank helper on Profile + Students"
```

---

## Wrap-up

2 commits, focused refactor. Push and open one PR.

```bash
git push -u origin chore/stats-cleanup-dx
gh pr create --base main --title "chore(statistics): shared currentRank helper" ...
```

## Notes for downstream work

- If a third caller of "highest-`sortOrder` rank" appears later, the helper is already in place — no more duplication risk.
- The `UserStatsRankCoverage` type export unlocks any future widget that wants a strict `props: { row: UserStatsRankCoverage }` signature without reaching through `UserStats['coverageByRank'][number]`.
