# Statistics cleanup — PR2 (Frontend polish + i18n backfill)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the deferred frontend polish + Finnish/Swedish translations for the statistics feature landed in PR #88.

**Architecture:** Five independent tasks touching frontend widgets, sidebar, and i18n locale files. No cross-file coupling — each task is a self-contained commit.

**Tech Stack:** React 19 + Tailwind (MD3 tokens) + TanStack Router + react-i18next.

## Global Constraints

- **FSD boundary:** `features/*` MUST NOT import from `@/i18n` — pass locale in via props.
- **MD3 tokens only** — no shadcn HSL, no hardcoded hex.
- **i18n keys** — mirror the exact key paths in `en.json`; every `t()` call in the source already has a matching English key.
- **No behaviour changes on the sidebar** — the placement change is a decision to accept the current slot, not a reorder.

---

### Task 1: Delete dead `Logger` field from cron service

**Files:**
- Modify: `apps/backend/src/modules/statistics/statistics.cron.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing changed for callers

- [ ] **Step 1: Delete the unused Logger field**

Remove the `private readonly logger = new Logger(StatisticsCronService.name);` line and the matching `import { Logger } from '@nestjs/common';` if `Logger` becomes unused after the delete. `runNightly()` uses `console.log` directly so the field is dead code.

- [ ] **Step 2: Verify build clean**

Run: `pnpm --filter backend build`
Expected: exit 0.

- [ ] **Step 3: Verify tests still pass**

Run: `pnpm --filter backend exec vitest run src/modules/statistics/statistics.cron.spec.ts`
Expected: 2/2 pass, no changes needed to the spec.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/statistics/statistics.cron.ts
git commit -m "chore(statistics): remove dead Logger field from cron service"
```

---

### Task 2: Clamp `CoverageMeter` percentage text (not just bar width)

**Files:**
- Modify: `apps/frontend/src/features/coverage-meter/ui/CoverageMeter.tsx`
- Modify: `apps/frontend/src/features/coverage-meter/ui/CoverageMeter.test.tsx`

**Interfaces:**
- Consumes: same props (`{ label: string; pct: number }`)
- Produces: same component; visible text now clamped identically to the bar

- [ ] **Step 1: Write the failing test**

Add to `CoverageMeter.test.tsx`:

```tsx
it('clamps the visible % text when pct is out of range (high)', () => {
  render(<CoverageMeter label="Coverage" pct={150} />);
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.queryByText('150%')).not.toBeInTheDocument();
});

it('clamps the visible % text when pct is out of range (low)', () => {
  render(<CoverageMeter label="Coverage" pct={-10} />);
  expect(screen.getByText('0%')).toBeInTheDocument();
  expect(screen.queryByText('-10%')).not.toBeInTheDocument();
});
```

The two existing "bar clamps" tests already assert `aria-valuenow`. Keep those; add these new ones alongside.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/features/coverage-meter`
Expected: FAIL on both new tests — current code renders `{pct}%` (unclamped) alongside the clamped bar.

- [ ] **Step 3: Implement the fix**

In `CoverageMeter.tsx`, change the label line from:

```tsx
<span className="tabular-nums text-on-surface-variant">{pct}%</span>
```

to:

```tsx
<span className="tabular-nums text-on-surface-variant">{clamped}%</span>
```

Zero-line addition — reuses the existing `clamped` value.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter frontend exec vitest run src/features/coverage-meter`
Expected: all cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/coverage-meter
git commit -m "fix(coverage-meter): clamp the visible % text, not only the bar"
```

---

### Task 3: Locale-aware number formatting in `StatTile`

**Files:**
- Modify: `apps/frontend/src/features/stat-tile/ui/StatTile.tsx`
- Modify: `apps/frontend/src/features/stat-tile/ui/StatTile.test.tsx`
- Modify: consumers that pass values into `<StatTile>` — add a `locale` prop derived from `i18n.resolvedLanguage`:
  - `apps/frontend/src/pages/admin-statistics/ui/AdminStatisticsPage.tsx`
  - `apps/frontend/src/pages/organisation-statistics/ui/OrganisationStatisticsPage.tsx`
  - `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `StatTileProps` gains an optional `locale?: string` field; falls back to `'en-US'` when unset

- [ ] **Step 1: Write the failing test**

Add to `StatTile.test.tsx`:

```tsx
it('formats numbers with the caller-supplied locale', () => {
  render(<StatTile label="Users" value={1234} locale="sv-SE" />);
  // sv-SE uses non-breaking space as thousands separator
  expect(screen.getByText(/1\s234/)).toBeInTheDocument();
});

it('still defaults to en-US when no locale is passed', () => {
  render(<StatTile label="Users" value={1234} />);
  expect(screen.getByText('1,234')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/features/stat-tile`
Expected: FAIL — no `locale` prop exists yet.

- [ ] **Step 3: Extend the component**

Replace `StatTile.tsx` with:

```tsx
import * as React from 'react';

export interface StatTileProps {
  label: string;
  value: number;
  deltaPct?: number;
  /**
   * BCP-47 locale for `Intl.NumberFormat`. Default `'en-US'` keeps output
   * deterministic when the caller doesn't supply one — features/* can't
   * import from `@/i18n` directly, so the caller (page/widget) reads
   * `i18n.resolvedLanguage` and passes it in.
   */
  locale?: string;
}

export function StatTile({
  label,
  value,
  deltaPct,
  locale = 'en-US',
}: StatTileProps): React.ReactElement {
  const fmt = new Intl.NumberFormat(locale).format(value);
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

- [ ] **Step 4: Update the three consumer pages to pass `locale`**

At the top of each of the three page files, add `useTranslation`:

```tsx
const { i18n } = useTranslation();
const locale = i18n.resolvedLanguage ?? 'en-US';
```

Then thread `locale={locale}` into every `<StatTile ...>` call in that file. Search each file for `<StatTile` and add the prop.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter frontend exec vitest run src/features/stat-tile src/pages/admin-statistics src/pages/organisation-statistics src/pages/my-organisation`
Expected: all pass.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/stat-tile apps/frontend/src/pages/admin-statistics apps/frontend/src/pages/organisation-statistics apps/frontend/src/pages/my-organisation
git commit -m "feat(stat-tile): accept locale prop for number formatting"
```

---

### Task 4: Document the sidebar-slot decision in `AppSidebar.tsx`

**Files:**
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: no behaviour change; adds a comment above the "Statistics" `SidebarMenuItem`

- [ ] **Step 1: Add a doc comment**

Find the `<SidebarMenuItem>` for `admin/statistics` (search for `admin/statistics`). Immediately above it, add:

```tsx
{/*
  Placed after "Feature flags". The Task 10 plan asked for placement
  between "Feature flags" and "Audit log", but Audit log renders before
  Feature flags in this file — the requested slot doesn't exist. This
  location is the closest to the intent (grouped with the other admin
  entries, ordered after Feature flags) without reordering unrelated
  entries.
*/}
```

- [ ] **Step 2: Verify build + tests**

Run: `pnpm --filter frontend typecheck && pnpm --filter frontend exec vitest run src/widgets/appsidebar`
Expected: both exit 0. No behaviour change.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "docs(appsidebar): explain the Statistics slot placement"
```

---

### Task 5: Add fi + sv translations for statistics keys

**Files:**
- Modify: `apps/frontend/src/i18n/locales/fi.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`

**Interfaces:**
- Consumes: nothing
- Produces: identical key paths as `en.json` under `nav.statistics`, `admin.statistics.*`, `organisation.statistics.*`

**Translations to add** (Finnish first, then Swedish). These are drafts; the human can amend before merge:

**Finnish (`fi.json`) — add to matching parent blocks:**

Under `nav`:
```json
"statistics": "Tilastot"
```

Under `admin` (add a new `statistics` sub-block):
```json
"statistics": {
  "title": "Tilastot",
  "tiles": {
    "students": "Oppilaat",
    "instructors": "Ohjaajat",
    "activeUsers30d": "Aktiiviset käyttäjät (30 pv)",
    "gradingsMtd": "Vyökokeet tässä kuussa"
  },
  "ranksHeading": "Vyöt koko järjestelmässä",
  "rebuild": "Rakenna tilastot uudelleen",
  "rebuilding": "Rakennetaan…",
  "rebuiltIn": "Rakennettiin {{durationMs}} ms:ssa"
}
```

Under `organisation` (add a new `statistics` sub-block):
```json
"statistics": {
  "tiles": {
    "students": "Oppilaat",
    "instructors": "Ohjaajat",
    "activeUsers30d": "Aktiiviset käyttäjät (30 pv)",
    "gradingsMtd": "Vyökokeet tässä kuussa"
  },
  "ranksHeading": "Vyöt tässä organisaatiossa",
  "trendLabel": "Oppilaat, viimeiset 12 kuukautta",
  "childrenHeading": "Alaorganisaatiot",
  "noChildren": "Ei alaorganisaatioita.",
  "breadcrumbLabel": "Yläorganisaatiot",
  "errors": {
    "forbidden": "Sinulla ei ole pääsyä tämän organisaation tilastoihin."
  }
}
```

**Swedish (`sv.json`) — add to matching parent blocks:**

Under `nav`:
```json
"statistics": "Statistik"
```

Under `admin`:
```json
"statistics": {
  "title": "Statistik",
  "tiles": {
    "students": "Elever",
    "instructors": "Instruktörer",
    "activeUsers30d": "Aktiva användare (30 d)",
    "gradingsMtd": "Graderingar denna månad"
  },
  "ranksHeading": "Bälten i hela systemet",
  "rebuild": "Bygg om statistik",
  "rebuilding": "Bygger om…",
  "rebuiltIn": "Ombyggd på {{durationMs}} ms"
}
```

Under `organisation`:
```json
"statistics": {
  "tiles": {
    "students": "Elever",
    "instructors": "Instruktörer",
    "activeUsers30d": "Aktiva användare (30 d)",
    "gradingsMtd": "Graderingar denna månad"
  },
  "ranksHeading": "Bälten i denna organisation",
  "trendLabel": "Elever, senaste 12 månaderna",
  "childrenHeading": "Underorganisationer",
  "noChildren": "Inga underorganisationer.",
  "breadcrumbLabel": "Överordnade organisationer",
  "errors": {
    "forbidden": "Du har inte behörighet till denna organisations statistik."
  }
}
```

- [ ] **Step 1: Edit `fi.json`**

Add the four blocks above (`nav.statistics`, `admin.statistics`, `organisation.statistics`) using the Edit tool. Preserve existing key order and comma placement inside each parent block — insertion point is wherever alphabetically sensible or at the end of the parent block. Match the file's existing indentation (2 spaces).

- [ ] **Step 2: Edit `sv.json`**

Same shape for Swedish.

- [ ] **Step 3: Verify JSON syntax + typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: exit 0. (i18n JSON files are typed by `i18n-resources-to-backend`'s inference — a trailing comma or bad quote will show up.)

- [ ] **Step 4: Sanity check: switch languages in dev**

Run: `pnpm --filter backend db:dev:up && pnpm dev`
Manually: open `http://localhost:5173`, sign in as sysadmin, visit `/admin/statistics` and `/organisation/<id>/statistics`. Switch language to `sv` then `fi` via the LocaleSwitcher. Confirm the tile labels, rebuild button, headings, and error text render in the switched language.

Report anything that still renders the English `defaultValue` fallback — that's a missed key.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/i18n/locales/fi.json apps/frontend/src/i18n/locales/sv.json
git commit -m "i18n(statistics): add Finnish + Swedish translations"
```

---

## Wrap-up

At this point the branch has 5 commits, each independently reviewable. Push and open one PR.

```bash
git push -u origin chore/stats-cleanup-frontend
gh pr create --base main --title "chore(statistics): frontend polish + fi/sv i18n" ...
```

PR body should list the 5 tasks and note that translations were drafted by Claude — human should sanity-check before merge.
