# Resource Admin Pattern

> Introduced in Chunk 2.3 of the architecture refactor (`docs/architecture-refactor-plan.md`).

The frontend admin pages for catalogued resources (techniques, patterns) share a common shape:

- Page header (title + description + "New X" CTA)
- A row of filter controls above the list
- A list of per-row components
- Inline delete via `window.confirm`
- URL-encoded filter state using the resource's **code** keys (not its UUIDs) for stable bookmarkable URLs

Two utilities make new admin list pages cheap:

## 1. `<ResourceAdminListPage>` — the shell

Lives at `apps/frontend/src/shared/ui/resource-admin/ResourceAdminListPage.tsx`.

Slots, not config: `filters` and `children` are `React.ReactNode`. The shell owns the page chrome (header layout, spacing, container width); the call site owns the filter controls and the per-row component.

```tsx
<ResourceAdminListPage
  title={t('admin.techniques.title')}
  description={t('admin.techniques.description')}
  newAction={{
    label: t('admin.techniques.newTechnique'),
    onClick: () => void navigate({ to: '/admin/techniques/new' }),
  }}
  filters={
    <>
      <ClassificationMultiSelect ... />
      <ClassificationMultiSelect ... />
    </>
  }
>
  <ul className="space-y-2">
    {rows.map((row) => <TechniqueListItem key={row.id} ... />)}
  </ul>
</ResourceAdminListPage>
```

Omit `newAction` for read-only resources.

## 2. `useClassificationCodeFilter(root)` — the URL bridge

Lives at `apps/frontend/src/entities/classification-category/lib/use-classification-code-filter.ts`.

Returns a stable bundle of `{ options, isPending, codesToIds, idsToCsv }` for one classification root. Resources that filter by multiple roots call the hook once per root.

```tsx
const type = useClassificationCodeFilter('technique_type');
const sotai = useClassificationCodeFilter('sotai_category');

const typeIds = useMemo(() => type.codesToIds(search.type), [type, search.type]);

<ClassificationMultiSelect
  options={type.options}
  isPending={type.isPending}
  selectedIds={typeIds}
  onChange={(ids) => updateKey('type', type.idsToCsv(ids))}
  label={t('techniques.filters.techniqueType')}
/>
```

The two existing migrations are in `apps/frontend/src/pages/admin/{techniques,patterns}/list/ui/`. Reading them in order shows the pattern at minimum (techniques: 3 independent filters) and with one extra wrinkle (patterns: conditional second filter that only renders when its parent is selected).

## Explicit non-goal: organisations

The `pages/admin/organisations/` admin is NOT migrated to this scaffold. It uses:

- Tree rendering (`<OrganisationTree>` widget) — not a flat list.
- A move-with-cycle-prevention dialog scoped to descendants.
- An inline membership manager Sheet.
- A `<LabelsFilterBar>` rather than per-root classification multi-selects.

Forcing organisations into a flat-list scaffold would either over-abstract the scaffold (carrying tree + move + members config every list page has to ignore) or leave organisations as an unmigrated exception that defeats the consolidation. It stays on its bespoke page intentionally. A future refactor could introduce a separate "tree admin page" scaffold for it; until then, organisations is the documented exception to the rule.

## Adding a new admin list page

1. Pick or create the entity in `apps/frontend/src/entities/<entity>/`.
2. Build the list-item component in `apps/frontend/src/features/<entity>-list-item/`.
3. Create the route + page under `apps/frontend/src/pages/admin/<entities>/list/`.
4. Compose `<ResourceAdminListPage>` + `useClassificationCodeFilter()` as the techniques/patterns pages do.

---

## Tree-aware variant — design pass (Phase 5.3a)

> **Status:** Design proposal. Awaiting decision before Phase
> 5.3b (migration) is opened.
>
> **Goal.** Phase 5 chunk 5.3 picks up the "explicit non-goal:
> organisations" point above. The 2.3 chunk left organisations
> bespoke because the flat-list scaffold didn't fit. The Phase 5
> question is: does a TREE-aware variant earn its keep, or is the
> 2.3 non-goal still the right call?
>
> Per the chunk 5.3a plan: this section presents the data, the
> options, and a recommendation. The user decides between them
> before 5.3b opens.

### Inspection of the current organisations admin page

`pages/admin/organisations/list/ui/AdminOrganisationsListPage.tsx`
is 243 lines. The line breakdown:

| Concern                          | LOC | Could a scaffold own it? |
|----------------------------------|----:|--------------------------|
| Imports                          | ~28 | No                       |
| Types + `descendantIds` util     | ~12 | No                       |
| Hooks + memoisation              | ~30 | No                       |
| `handleFilterChange`             | ~10 | No                       |
| Chrome — header + filter bar     | ~22 | **Yes (covered today)**  |
| Loading/error/tree rendering     | ~35 | Partial — loading/error chrome maybe |
| Move dialog                      | ~30 | No                       |
| Delete dialog                    | ~14 | No                       |
| Members `<Sheet>` (state-bound)  | ~30 | No                       |

The scaffold-eligible content is the **~22 lines of chrome**
(header + filter section) plus maybe **~5 lines of loading/error
chrome** if we extend the scaffold to model those states. Net
addressable: ~27 lines out of 243 (≈11 %).

The remaining ~216 lines are:

  - Stateful side-panel machinery (two dialogs + a sheet,
    each with their own `open`/`onOpenChange` + confirm
    callbacks).
  - The cycle-aware `candidatesFor` calculation feeding the
    move dialog.
  - The tree-specific data shaping (`buildTree`, `childCount`,
    `treeById`).

None of those are duplication with the techniques or patterns
admins — they're inherently organisation-specific.

### What "tree-aware" actually means

The list-vs-tree distinction itself doesn't matter at the
scaffold level. `ResourceAdminListPage`'s `children` slot is
already `React.ReactNode` — it accepts any content, including a
tree component. We don't need a "tree" variant of the scaffold
for the simple reason that the existing scaffold doesn't have a
list-vs-tree opinion.

The real question is whether the scaffold should grow slots for
the **state-bound side panels** (dialogs, sheets, error states)
that organisations has and techniques/patterns don't. That's a
genuine architectural choice.

### Three options

#### Option A — One scaffold, slot-based

Extend `ResourceAdminListPage` with two optional slots:

```tsx
export interface ResourceAdminListPageProps {
  title: string;
  description?: string;   // already optional; orgs page doesn't use it
  newAction?: { label: string; onClick: () => void };
  filters?: React.ReactNode;
  state?: { isLoading?: boolean; isError?: boolean; error?: Error };
  children: React.ReactNode;
  /** Dialogs, sheets, other state-bound side panels. */
  panels?: React.ReactNode;
}
```

Organisations passes:

```tsx
<ResourceAdminListPage
  title={...}
  newAction={{ ... }}
  filters={<LabelsFilterBar ... />}
  state={{ isLoading, isError, error }}
  panels={
    <>
      {dialog.kind === 'move' && <OrganisationMoveDialog ... />}
      {dialog.kind === 'delete' && <OrganisationDeleteDialog ... />}
      <Sheet open={!!membersFor} ...>...</Sheet>
    </>
  }
>
  <OrganisationTree ... />
</ResourceAdminListPage>
```

  - **Pros.** One scaffold, one mental model. Existing
    techniques/patterns continue working (new slots are
    optional). Future tree-shaped admins compose the same way.
  - **Cons.** The `panels` slot doesn't really save lines —
    it's a passthrough region. The scaffold owns ~5 lines of
    loading/error chrome. Realistic LOC: 243 → ~218 (−10 %).
  - **Risk.** Adding three more optional props to an
    already-config-loaded scaffold. The leaky-abstraction
    pattern that retired BeltRanks's migration (INV-2) starts
    here — every new admin will be tempted to widen the
    scaffold one more prop.

#### Option B — Two scaffolds, shared shell

Extract `ResourceAdminPageShell` that owns ONLY the chrome
(container, title, description, CTA, filters area).
`ResourceAdminListPage` stays as a thin wrapper around the shell
for flat-list cases. A new `ResourceAdminTreePage` is another
thin wrapper for tree-shaped cases. The tree wrapper adds the
side-panel slot the list version doesn't need.

```tsx
function ResourceAdminPageShell({ title, description, newAction, filters, children }) { ... }
function ResourceAdminListPage(...) { return <Shell {...} ><ul>{items}</ul></Shell>; }
function ResourceAdminTreePage({ panels, state, children, ...rest }) {
  return <Shell {...rest}>
    {state?.isLoading ? <Loading /> : state?.isError ? <Error e={state.error} /> : children}
    {panels}
  </Shell>;
}
```

  - **Pros.** Tree variant carries its own concerns; flat-list
    variant stays minimal. Clean conceptual split — each
    variant is honest about what it does.
  - **Cons.** ~120 lines of new scaffold code (shell +
    list-page + tree-page + 5 spec files) for one consumer.
    Realistic LOC delta: orgs page 243 → ~218, scaffold layer
    +~120, total +~95 lines NET ACROSS THE CODEBASE. Same trap
    as INV-2.
  - **Risk.** "When the third tree-shaped admin arrives this
    pays off" — but no third tree-shaped admin is planned.
    Speculative abstraction.

#### Option C — Don't migrate

Document explicitly that organisations stays bespoke. The 2.3
non-goal was correct. Phase 5.3 re-investigated and reached
the same conclusion.

  - **Pros.** Zero new code. Zero new abstraction surface. The
    addressable savings (~27 lines of ~243) doesn't clear the
    bar after subtracting scaffold-wiring overhead. INV-2's
    lesson applies: at this scale the abstraction costs more
    than the duplication.
  - **Cons.** The 2.3 non-goal stays as a known
    "this-could-be-cleaner" loose end. The Phase 5 plan
    promised to revisit; the answer is "no change, but here's
    why."
  - **Risk.** None — organisations works today.

### Scoring summary

| Metric                                | A (slots)    | B (two scaffolds) | C (no migration) |
|---------------------------------------|--------------|-------------------|-------------------|
| LOC saved in orgs page                | ~25          | ~25               | 0                 |
| LOC added to scaffold layer           | ~30          | ~120              | 0                 |
| **Net LOC delta**                     | **+5**       | **+95**           | **0**             |
| New mental-model surface              | 3 props      | 2 components      | 0                 |
| Ergonomics for future tree admin      | Easy         | Easier            | Same as today     |
| Number of future tree admins planned  | 0            | 0                 | 0                 |
| Risk of scaffold-prop sprawl          | Real         | Lower             | None              |

### Recommendation

**Option C — don't migrate.**

The addressable savings (~27 lines of chrome) doesn't clear the
LOC overhead of either abstraction. The 2.3 non-goal was the
right call; the Phase 5 revisit confirms it with measurement.

INV-2 codified the measurement discipline: count the LOC at the
codebase level, not at the call site, and weigh the result
against any consistency value the abstraction brings. For
BeltRanks the +26 LOC tax was offset by aligning the three
belt-catalog services on one outer shape — the team shipped
the migration knowingly. For organisations the math is
different: there's no peer consumer waiting to benefit from a
shared shape, so the +5 LOC of Option A or the +95 LOC of
Option B earn nothing structural in return.

Phase 5.3b (the migration step) is **closed-without-migration**
under this recommendation. The Phase 5 plan's chunk 5.3 gets a
status update mirroring the 5.2 / INV-2 PROCESS — investigated,
measured, weighed — but with the opposite outcome because the
inputs to the trade-off are different.

If the user prefers A or B despite the LOC data, 5.3b opens
with the chosen option. Otherwise this section serves as the
documented decision: organisations stays bespoke, and the
inventory above is the evidence for re-visitors.

Net per-page LOC after the migration: techniques **195 → 130** lines (−33%), patterns **197 → 142** lines (−28%). Most of the saving is the URL-state bridge that the hook absorbs.
