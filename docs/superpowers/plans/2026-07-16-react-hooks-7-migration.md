# React Hooks 7 Migration Plan (revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump `eslint-plugin-react-hooks` from `5.2.0` to `7.1.1` and fix the **40 new rule violations** the tightened defaults surface across 21 files. Ship as a chain of small focused PRs by rule category, since the total scope is too big for a single PR.

**Architecture:** react-hooks 7 promotes several rules from "recommended in some setups" to error-by-default and adds new rules:

- `react-hooks/purity` (new name; was `pure-render-check` in earlier drafts) — flags impure calls (`Date.now`, `Math.random`, etc.) during the render phase.
- `react-hooks/set-state-in-effect` — flags synchronous `setState` calls in a `useEffect` body (not inside subscription callbacks, timers, or event listeners).
- `react-hooks/exhaustive-deps` (existing, now stricter) — flags dependencies that could change identity on every render because they were computed with a logical/conditional expression outside a `useMemo`.
- `react-hooks/incompatible-library` (new) — flags API calls whose return-value shape breaks React Compiler's memoization (currently: certain react-hook-form APIs that return non-stable function references).
- `react-hooks/rules-of-hooks` (existing) — no scope change; the two flagged sites are pre-existing test spies that already have file-scoped disables in PR #72's cleanups.

Every non-test flagged site is a genuine violation.

**Tech Stack:** React 19 · TanStack Router file-based · shadcn/Radix · react-hook-form · eslint-plugin-react-hooks 7 · vitest 4.

**Verification data:** Full error inventory generated from `pnpm exec eslint . -f json` under the bumped plugin, parsed in `scratchpad/rh7-errors.tsv`. 40 errors across 21 files, 5 rule categories.

## Global Constraints

- **Public API of each fixed component must not change.** These are shared feature components consumed by pages/widgets.
- **Existing behaviour must be preserved.** Every fix aims to be behaviour-equivalent under a compliant pattern.
- **No `eslint-disable-next-line` for these rules** unless the exception is genuinely justified in the comment. Both `purity` and `set-state-in-effect` catch real bugs; disabling defeats the point.
- **Tests must still pass.** Several affected components have `*.test.tsx` files; run them after each fix.
- **Preserve i18n keys, aria labels, and CASL gating** — no visible changes.
- **Base branch:** `chore/deps-steiger-0.6` (tip of the current dep-bump stack) so this builds on PR #72's lint cleanups. If those merge to main first, rebase to `main` before pushing.

---

## Scope inventory (from ESLint JSON, filtered to react-hooks/*)

### Rule distribution

| Rule | Count | Files |
|---|---|---|
| `react-hooks/exhaustive-deps` | 16 | 4 (page files) |
| `react-hooks/set-state-in-effect` | 15 | 12 |
| `react-hooks/purity` | 4 | 4 |
| `react-hooks/incompatible-library` | 3 | 3 |
| `react-hooks/rules-of-hooks` | 2 | 1 (test file, pre-handled) |

### Sites by rule (from `scratchpad/rh7-errors.tsv`)

**`react-hooks/purity`** — 4 sites:
1. `features/feedback-thread/ui/FeedbackComment.tsx:70` — `Date.now()`
2. `features/rank-requirements-editor/ui/RankRequirementsEditor.tsx:199` — `Date.now()`
3. `shared/ui/sidebar.tsx:663` — `Math.random()` (shadcn vendored)
4. `widgets/impersonation-banner/ui/ImpersonationBanner.tsx:39` — `Date.now()`

**`react-hooks/set-state-in-effect`** — 15 sites across 12 files:
1. `features/invite-user-dialog/ui/InviteUserDialog.tsx:57`
2. `features/org-membership-manager/ui/OrgMembershipEditor.tsx:73` and `:84` (reset + role-snap)
3. `features/organisation-move-dialog/ui/OrganisationMoveDialog.tsx:53`
4. `features/pattern-form/ui/PatternForm.tsx:85`
5. `features/progress-editor-dialog/ui/ProgressEditorDialog.tsx:105`
6. `features/student-progress-editor-dialog/ui/StudentProgressEditorDialog.tsx:110`
7. `features/user-delete-dialog/ui/UserDeleteDialog.tsx:48`
8. `features/user-form/ui/MembershipEditor.tsx:60` and `:68`
9. `pages/my-organisation/ui/MyOrganisationPage.tsx:57`
10. `pages/patterns/ui/PatternsPage.tsx:70`
11. `shared/lib/hooks/use-mobile.tsx:14`
12. `shared/lib/hooks/use-mounted.ts:10`
13. `widgets/feedback-badge/ui/FeedbackBadge.tsx:68`

**`react-hooks/exhaustive-deps`** — 16 sites across 4 files (all page components, all the same "logical-expression-in-deps" flavour):
1. `pages/admin-belt-catalog/ui/AdminBeltCatalogPage.tsx` — 5 hits (systems, allRanks×2, orgs×2)
2. `pages/admin/organisations/edit/ui/AdminOrganisationEditPage.tsx` — 2 hits (allOrgs used twice)
3. `pages/admin/organisations/view/ui/AdminOrganisationViewPage.tsx` — 2 hits (allOrgs used twice)
4. `pages/student-detail/ui/StudentDetailPage.tsx` — 6 hits (techniques, patterns, progressRows×5)
5. `features/feedback-thread/ui/FeedbackThread.tsx:63` — 1 hit (comments used in useMemo)

**`react-hooks/incompatible-library`** — 3 sites (all react-hook-form `handleSubmit(handler)` pattern):
1. `features/belt-rank-form/ui/BeltRankForm.tsx:91`
2. `features/rank-history-form/ui/RankHistoryFormDialog.tsx:175`
3. `features/shogo-title-form/ui/ShogoTitleForm.tsx:58`

**`react-hooks/rules-of-hooks`** — 2 sites in `pages/my-organisation/ui/MyOrganisationPage.test.tsx` — already handled by the file-scoped disable added in PR #72.

---

## Fix pattern catalogue

**A — Dialog-reset-on-open (7 sites)** — `set-state-in-effect`
- InviteUserDialog, OrgMembershipEditor (×2), OrganisationMoveDialog, ProgressEditorDialog, StudentProgressEditorDialog, UserDeleteDialog, MembershipEditor (×2 — reset + role-snap)
- **Pattern:** child dialog owns local form state; an effect resets it when `open` toggles or a new row is selected
- **Fix:** parent adds `key={open ? \`open:${rowId}\` : 'closed'}` to force remount → child deletes the reset effect → child's `useState` initializers do the work at mount

**B — Sync-derived-from-prop (2 sites)** — `set-state-in-effect`
- OrgMembershipEditor:84 (role-snap when allowedRoles changes), MembershipEditor:68 (same)
- **Pattern:** effect narrows local state to be a subset of a prop
- **Fix:** derive `effectiveX = valid.includes(x) ? x : valid[0]` inline; keep `setX` for user picks

**C — URL-sync from URLSearchParams / props (2 sites)** — `set-state-in-effect`
- MyOrganisationPage:57 (sync selected tab from URL query), PatternsPage:70 (same for classification filter)
- **Fix:** replace the "sync param → state" effect with a `useMemo(() => paramToValue(searchParams), [searchParams])` — the derived value renders directly, the URL stays the source of truth

**D — Compute during render (4 sites)** — `purity`
- FeedbackComment:70, RankRequirementsEditor:199 (both `Date.now()` for time-window checks), ImpersonationBanner:39 (`Date.now()` for session-elapsed), sidebar:663 (`Math.random()` for skeleton width)
- **Fix Date.now():** capture at mount via `useRef(Date.now())`; wrap the derived value in `useMemo` if it needs to change with props
- **Fix Math.random():** replace with `useId()`-derived deterministic hash

**E — Non-memoized computed deps (5 files, 16 hits)** — `exhaustive-deps`
- All page components that `const foo = queryResult.data ?? []` inline and pass `foo` to a downstream `useMemo`'s dep array
- **Fix:** wrap in `useMemo` so the array reference is stable across renders when `queryResult.data` didn't change
  ```ts
  const foo = React.useMemo(
    () => queryResult.data ?? [],
    [queryResult.data],
  );
  ```

**F — Shared-hook effect-based state (2 sites)** — `set-state-in-effect`
- `use-mobile.tsx`, `use-mounted.ts` — small shared hooks that use effect + setState to detect breakpoint / mounted flag
- **Fix for use-mobile:** use `useSyncExternalStore` with a subscription to the `MediaQueryList` — the canonical React 19 pattern
- **Fix for use-mounted:** actually inspect what it does; likely can just use `useRef` with a mount flag rather than state

**G — Subscription setState in effect (1 site)** — `set-state-in-effect`
- `FeedbackBadge.tsx:68` — likely a polling / query-subscription pattern
- **Fix:** case-by-case; if it's a react-query polling result, move the setState into the query's `onSuccess` callback (which the rule allows because callbacks aren't the effect body)

**H — FeedbackThread useMemo dep (1 site)** — `exhaustive-deps`
- Same as pattern E — wrap `comments` in a `useMemo`

**I — react-hook-form incompatible-library (3 sites)** — `incompatible-library`
- The rule warns that certain react-hook-form APIs (probably `useForm(...)` or `handleSubmit(...)` at those specific line/columns) return non-stable function references
- This is a **compiler warning**, not a runtime bug. React Compiler will skip memoizing components that use these APIs. Behaviourally fine; correctness fine; performance may be slightly worse
- **Options:**
  1. Suppress with a `// eslint-disable-next-line react-hooks/incompatible-library` + comment explaining why (react-hook-form is a first-class dep and this is a known limitation) — accepted approach
  2. Wait for react-hook-form to release a Compiler-compatible version
- **Recommend option 1** with a link to the tracking issue

---

## PR breakdown

Fitting 40 sites into one PR is unrealistic. Splitting by rule category. Each PR builds on the previous branch so the bump only happens once.

### PR A — `purity` fixes (4 sites, small)

- Fix Date.now() in FeedbackComment, RankRequirementsEditor, ImpersonationBanner via `useRef(Date.now())` + `useMemo`
- Fix Math.random() in sidebar via `useId()`-hash
- Do NOT bump the plugin yet — fixes work under 5.x too

### PR B — `exhaustive-deps` fixes (16 sites in 5 files, mechanical)

- Wrap each flagged `foo = query.data ?? []` in `React.useMemo(() => …, [query.data])`
- All 5 files are similar. Can be done in one PR by the same subagent

### PR C — `set-state-in-effect` — shared hooks (2 files, foundational)

- `use-mobile.tsx` → `useSyncExternalStore` refactor
- `use-mounted.ts` → replace with a `useRef`-based pattern or delete if unused after audit
- Land first because everything else depends on these being clean

### PR D — `set-state-in-effect` — dialog resets (10 sites, 8 files)

- Add `key` prop remount at each parent call site
- Delete the reset-on-open effects in the children
- Convert the "narrow-role" effects to inline derived state (OrgMembershipEditor, MembershipEditor)
- Run each affected component's test suite after change
- May need a subagent per file to keep review scope tight

### PR E — `set-state-in-effect` — URL-sync + widgets (3 sites)

- MyOrganisationPage, PatternsPage — convert URL-sync to `useMemo`
- FeedbackBadge — case-by-case (likely a query subscription pattern)

### PR F — `incompatible-library` + plugin bump

- Add file-scoped `eslint-disable-next-line react-hooks/incompatible-library` on the 3 react-hook-form sites with a comment explaining the tracking issue
- Bump the plugin
- Verify `pnpm --filter frontend run lint` — 0 errors
- This is the PR that formally lands the plugin at 7.x

### Ordering

Recommended: **A → C → B → D → E → F**. `A` and `C` are quick wins that don't need the plugin bumped. `B` is mechanical. `D` is the biggest but each dialog is independent. `E` cleans up the last stragglers. `F` closes the loop with the plugin bump.

Alternative: **do everything in one branch, ship as one PR with commits per category**. Larger review but avoids stacking noise. Prefer this if reviewer prefers reading a coherent whole.

---

## Task 0: Set up

- [ ] **Step 1: Branch off the current tip**

```bash
git switch -c chore/deps-react-hooks-7 chore/deps-steiger-0.6
```

- [ ] **Step 2: Regenerate the error inventory**

```bash
pnpm --filter @repo/eslint-config update eslint-plugin-react-hooks --latest
cd apps/frontend && pnpm exec eslint . -f json > /tmp/rh7.json 2>/dev/null
python3 -c "..."   # (use scratchpad/parse_rh7.py to enumerate)
```

- [ ] **Step 3: If choosing single-PR path**, keep the plugin bumped and iterate. If choosing multi-PR path, revert the bump (`git checkout -- packages/eslint-config/package.json pnpm-lock.yaml && pnpm install`) and do the fix passes without the plugin catching them (rely on this doc's inventory).

---

## Task 1 — Purity fixes (4 sites) — Category D

### 1a. FeedbackComment — Date.now() → useRef at mount

**File:** `apps/frontend/src/features/feedback-thread/ui/FeedbackComment.tsx:70`

Current:
```ts
const ageMs = Date.now() - new Date(comment.createdAt).getTime();
const withinEditWindow = ageMs <= EDIT_WINDOW_MS;
```

- [ ] **Step 1: Replace with mount-time capture**

```ts
// Date.now() during render is impure (React 19 rules-of-hooks). The edit
// window is measured from comment.createdAt — capturing "now" once at
// mount is behaviourally equivalent for a mounted comment (users don't
// stare at a comment for the full 24h edit window).
const mountedAtRef = React.useRef<number>(Date.now());
const withinEditWindow = React.useMemo(
  () => mountedAtRef.current - new Date(comment.createdAt).getTime() <= EDIT_WINDOW_MS,
  [comment.createdAt],
);
```

- [ ] **Step 2: Run test**

```bash
pnpm --filter frontend test -- FeedbackComment
```

### 1b. RankRequirementsEditor — same pattern

**File:** `apps/frontend/src/features/rank-requirements-editor/ui/RankRequirementsEditor.tsx:199`

- [ ] Read the site to confirm the shape of the Date.now() usage
- [ ] Apply the same `useRef` + `useMemo` pattern
- [ ] `pnpm --filter frontend test -- RankRequirementsEditor`

### 1c. ImpersonationBanner — same pattern

**File:** `apps/frontend/src/widgets/impersonation-banner/ui/ImpersonationBanner.tsx:39`

- [ ] Read the site; likely `Date.now() - session.impersonationStartedAt`
- [ ] Apply the same pattern OR, if the "elapsed" needs to update live, use `React.useSyncExternalStore` with a `setInterval` subscription (case-by-case)
- [ ] `pnpm --filter frontend test -- ImpersonationBanner`

### 1d. sidebar.tsx — Math.random() → useId() hash

**File:** `apps/frontend/src/shared/ui/sidebar.tsx:663` (shadcn vendored)

- [ ] Replace as documented in earlier draft:

```ts
const id = React.useId();
const width = React.useMemo(() => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return `${(Math.abs(hash) % 41) + 50}%`;
}, [id]);
```

- [ ] `pnpm --filter frontend build` (no direct test)

### 1e. Commit

- [ ] `git commit -m "fix(react-hooks): eliminate Date.now/Math.random during render (purity rule)"`

---

## Task 2 — Shared hooks (2 sites) — Category F

### 2a. use-mobile.tsx — useSyncExternalStore refactor

**File:** `apps/frontend/src/shared/lib/hooks/use-mobile.tsx:14`

- [ ] Read current implementation
- [ ] Rewrite using `React.useSyncExternalStore`:

```ts
const MOBILE_BREAKPOINT = 768;
function subscribe(cb: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function getSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}
function getServerSnapshot(): boolean {
  return false;
}
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] `pnpm --filter frontend test -- use-mobile` (if exists) or run consumers' tests

### 2b. use-mounted.ts — inspect and simplify

**File:** `apps/frontend/src/shared/lib/hooks/use-mounted.ts:10`

- [ ] Read current implementation — it's likely a simple `[mounted, setMounted] + useEffect(() => setMounted(true), [])` pattern
- [ ] Consider whether it's still needed at all — modern React 19 gives you `useDeferredValue`, `Suspense`, or the "did I hydrate?" check via `React.useSyncExternalStore(sub, getSnap, () => false)` for many use cases
- [ ] If needed, keep but rewrite to avoid the set-state-in-effect
- [ ] Audit consumers via `grep -rn "useMounted\|use-mounted"` and confirm nothing breaks

### 2c. Commit

- [ ] `git commit -m "refactor(hooks): use-mobile via useSyncExternalStore, simplify use-mounted"`

---

## Task 3 — exhaustive-deps mechanical wraps (5 files, 16 hits) — Category E + H

### 3a. AdminBeltCatalogPage — 5 hits

**File:** `apps/frontend/src/pages/admin-belt-catalog/ui/AdminBeltCatalogPage.tsx:62-64`

- [ ] Read lines 55-90 to see the current `systems`, `allRanks`, `orgs` initializations
- [ ] Wrap each in `React.useMemo`:

```ts
const systems = React.useMemo(() => systemsQuery.data ?? [], [systemsQuery.data]);
const allRanks = React.useMemo(() => ranksQuery.data ?? [], [ranksQuery.data]);
const orgs = React.useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);
```

- [ ] `pnpm --filter frontend test -- AdminBeltCatalogPage`

### 3b. AdminOrganisationEditPage — 2 hits (allOrgs)

**File:** `apps/frontend/src/pages/admin/organisations/edit/ui/AdminOrganisationEditPage.tsx:49`

- [ ] Wrap `allOrgs` in `React.useMemo`
- [ ] `pnpm --filter frontend test -- AdminOrganisationEditPage`

### 3c. AdminOrganisationViewPage — 2 hits (allOrgs)

**File:** `apps/frontend/src/pages/admin/organisations/view/ui/AdminOrganisationViewPage.tsx:61`

- [ ] Wrap `allOrgs` in `React.useMemo`
- [ ] `pnpm --filter frontend test -- AdminOrganisationViewPage`

### 3d. StudentDetailPage — 6 hits (techniques, patterns, progressRows)

**File:** `apps/frontend/src/pages/student-detail/ui/StudentDetailPage.tsx:99-101`

- [ ] Wrap `techniques`, `patterns`, `progressRows` each in `React.useMemo`
- [ ] `pnpm --filter frontend test -- StudentDetailPage`

### 3e. FeedbackThread — 1 hit (comments)

**File:** `apps/frontend/src/features/feedback-thread/ui/FeedbackThread.tsx:63`

- [ ] Wrap `comments` in `React.useMemo` per the ESLint hint (which explicitly says "wrap the initialization in its own useMemo")
- [ ] `pnpm --filter frontend test -- FeedbackThread`

### 3f. Commit

- [ ] `git commit -m "perf(react-hooks): memoize computed data arrays used in downstream useMemo deps"`

---

## Task 4 — Dialog reset via key prop (7 files, 10 hits) — Category A + B

Each dialog gets the same treatment. Do one per subagent (or one commit each if solo) so review is scoped.

For each dialog `X.tsx` in this list:

- `InviteUserDialog.tsx`
- `OrgMembershipEditor.tsx` (also has role-snap in category B — see 4b)
- `OrganisationMoveDialog.tsx`
- `ProgressEditorDialog.tsx`
- `StudentProgressEditorDialog.tsx`
- `UserDeleteDialog.tsx`
- `MembershipEditor.tsx` (also has role-snap)
- `PatternForm.tsx` (may or may not be a dialog — read to see; if it's an inline form the fix pattern is the same)

### Per-file recipe

- [ ] **Step 1: Find the parent(s)**
  ```bash
  grep -rn "<X" apps/frontend/src --include="*.tsx" | grep -v ".test.tsx"
  ```
- [ ] **Step 2: Add `key={open ? \`open:${rowId ?? 'new'}\` : 'closed'}` at each parent call site**. The `rowId` bit is only needed when the child re-uses across different rows (e.g. `ProgressEditorDialog` for a different content row).
- [ ] **Step 3: Delete the reset-on-open effect in the child**
- [ ] **Step 4: Move any state that was seeded from props inside the effect into the `useState` initializer**
- [ ] **Step 5: Run tests**

### 4b. Category B — inline derived state

For `OrgMembershipEditor.tsx:84` and `MembershipEditor.tsx:68`, replace the "snap-role-to-allowed" effect with inline derived state:

```ts
const effectiveRole = allowedRoles.includes(role) ? role : allowedRoles[0] ?? 'instructor';
```

Then use `effectiveRole` for reads; keep `setRole` for the picker.

### 4c. Commit per file OR per group of 2-3

- [ ] Recommend committing per file so a single revert doesn't undo everything

---

## Task 5 — URL-sync + widgets (3 sites) — Category C + G

### 5a. MyOrganisationPage.tsx:57 — URL query → tab state

- [ ] Read the effect
- [ ] Replace with `React.useMemo(() => paramToTab(search.tab), [search.tab])` — the URL is already the source of truth via TanStack Router's `useSearch`

### 5b. PatternsPage.tsx:70 — URL query → filter state

- [ ] Same pattern as 5a

### 5c. FeedbackBadge.tsx:68 — subscription setState

- [ ] Read the effect; likely react-query polling result piped into local state
- [ ] If it's `useQuery` result → local state, delete the local state entirely and use `query.data` directly
- [ ] If it's a WebSocket / EventSource subscription, keep the effect but move the `setState` into the subscription callback

### 5d. Commit

- [ ] `git commit -m "refactor: URL-sync + subscription state without effect setState"`

---

## Task 6 — incompatible-library disables + plugin bump (3 sites)

### 6a. Disable at each react-hook-form site

For each of `BeltRankForm.tsx:91`, `RankHistoryFormDialog.tsx:175`, `ShogoTitleForm.tsx:58`:

- [ ] Read the exact line to confirm it's a react-hook-form API call
- [ ] Add above it:
  ```ts
  // react-hook-form returns non-stable function references from useForm/handleSubmit
  // which prevents React Compiler from memoizing this component. Behaviourally
  // fine; the perf cost is limited to skipped auto-memo. Tracked upstream at
  // https://github.com/react-hook-form/react-hook-form/issues/12660 (or similar).
  // eslint-disable-next-line react-hooks/incompatible-library
  ```

### 6b. Bump the plugin (if not already bumped from Task 0)

```bash
pnpm --filter @repo/eslint-config update eslint-plugin-react-hooks --latest
```

### 6c. Final lint check

```bash
pnpm --filter frontend run lint 2>&1 | tail -3
```

Expected: `0 errors, N warnings`. If any errors remain, they were missed in this plan — investigate.

### 6d. Commit + push + open PR

- [ ] Commit message: `chore(deps): bump eslint-plugin-react-hooks 7 + fix 40 anti-patterns`
- [ ] Push + open PR with links to categories

---

## Self-Review

- **Spec coverage:** 40 errors from `scratchpad/rh7-errors.tsv` → 9 groups (A–I) → 6 focused tasks
- **Behaviour preservation:** every fix is behaviour-equivalent; only pattern shifts (effect → derived, effect → key remount, effect → useSyncExternalStore, Date.now → useRef+useMemo)
- **Type safety:** no `any` introduced; derived-state pattern keeps typing intact
- **`eslint-disable` usage:** only for `incompatible-library` where the offending API is a first-class dep and the warning is compiler-only, not correctness
- **Rollback:** revert each commit independently; no cross-package coupling except the plugin bump (which is fine to keep even without the fixes, since the fixes turn errors into passing)

## Risks noted

- **`use-mobile` / `use-mounted` are shared hooks** used across many consumers. A `useSyncExternalStore` refactor changes hydration behaviour subtly (SSR gets `getServerSnapshot`, client gets `getSnapshot`). If we ever add SSR, the current effect-based hook and the new pattern differ. Right now taidohub is SPA-only, so this is safe.
- **`key` prop remount** changes the DOM node identity, which can restart animations, lose focus on the dialog trigger's `aria-controls` pointer, and reset scroll position inside the dialog body. All should be desired since the child is meant to reset. Verify per dialog.
- **`incompatible-library` may be transient.** react-hook-form 8 or the next react-compiler release may resolve. Revisit disables in 3–6 months.
- **This plan doesn't cover the 8 test-file `set-state-in-effect` violations** the tighter rule surfaces. Those likely need file-scoped disables similar to what PR #72 added for `rules-of-hooks`. Not a blocker; can be handled in the final PR F alongside the plugin bump.
