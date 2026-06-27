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

Net per-page LOC after the migration: techniques **195 → 130** lines (−33%), patterns **197 → 142** lines (−28%). Most of the saving is the URL-state bridge that the hook absorbs.
