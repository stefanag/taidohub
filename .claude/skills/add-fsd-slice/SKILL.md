---
name: add-fsd-slice
description: "Scaffold a new Feature-Sliced Design slice (entity, feature, widget, or page) for the taidohub frontend, with the correct segment layout, a proper Public API index.ts, and imports that respect the FSD layer direction. Use whenever a change needs a new entities/, features/, widgets/, or pages/ slice, or when reviewing whether an existing change respects layer boundaries. Prevents the two most common FSD violations: reaching into a slice's internals instead of its index.ts, and same-layer cross-imports."
---

# add-fsd-slice: frontend slice scaffolder

taidohub enforces FSD v2.1 with `pnpm arch` (Steiger) in CI. A slice built by copy-pasting an existing
one tends to carry over a stale import path or skip the public API — both pass locally and fail CI.
Build new slices with this checklist instead.

## 0. Pick the right layer

```
app  →  pages  →  widgets  →  features  →  entities  →  shared
```

Imports flow downward only. Ask:

- **entity** — a core domain noun with its own API/hooks (`entities/label`, `entities/technique`). If
  it corresponds to a `@repo/contracts` schema and a backend module, it's almost certainly an entity.
- **feature** — a user action that mutates or composes entities (`features/technique-form`,
  `features/invite-user-dialog`). If the name is a verb phrase or a dialog/form, it's a feature.
- **widget** — a composed, page-section-sized chunk built from features/entities
  (`widgets/appsidebar`, `widgets/audit-log-table`). Needed when a section is reused across pages or
  is complex enough to want its own tests separate from the page.
- **page** — routed content composing widgets/features/entities for one URL
  (`pages/admin-belt-catalog`). One page per route; the route file in `app/router/routes/` just mounts it.

`app/` and `shared/` have segments only, no slices — don't create a "slice" there.

## 1. Segments

Inside the slice directory, only the segments the slice actually needs:

- `ui/` — components
- `model/` — state, TanStack Query hooks/mutations
- `api/` — typed fetchers, each response parsed through the matching `@repo/contracts` schema
- `lib/` — pure helper functions

Template for an entity's `api/` file (see `entities/label/api/labels.api.ts` for the real shape):

```typescript
export async function fetchThings(): Promise<Thing[]> {
  const res = await httpClient.get('/things');
  return z.array(ThingSchema).parse(await res.json()); // never trust the response shape unparsed
}
```

Template for `lib/hooks.ts`:

```typescript
export function useThings() {
  return useQuery({ queryKey: ['things'], queryFn: fetchThings });
}
```

## 2. Public API (`index.ts`)

Every slice (tests and stories exempt) exports its public surface through one `index.ts`:

```typescript
export { useThings } from './lib/hooks';
export { ThingCard } from './ui/ThingCard';
export type { Thing } from './api/thing.api';
```

**Nothing outside the slice imports from `ui/`, `model/`, `api/`, or `lib/` directly.** Importing
`entities/thing/lib/hooks` from another slice is the single most common Steiger failure — always import
`entities/thing` and let its `index.ts` decide what's exposed.

## 3. Import direction check

Before writing any component, confirm every planned import goes **down**, never sideways:

- A feature may import entities and shared — never another feature.
- An entity may import shared — never another entity, never a feature.
- A widget may import features, entities, shared — never another widget, never a page.

If two same-layer slices genuinely need each other's data, that's a signal the shared piece belongs one
layer down (usually as a new or extended entity), not a reason to add a sideways import.

## 4. Library placement (non-negotiable, from README §7)

| Concern | Lives in |
|---|---|
| shadcn primitives | `shared/ui/` |
| `cn(...)` helper | `shared/lib/utils.ts` |
| `fetch` wrapper | `shared/api/httpClient.ts` |
| `QueryClient` | `shared/api/queryClient.ts` |
| All routing | `app/router/` |
| Providers (Query, Router, Auth, Ability) | `app/providers/` |
| CASL `defineAbilityFor` | `shared/lib/casl/` |

A new shadcn component goes in `shared/ui/`, full stop, even if only one feature currently uses it.

## 5. i18n

Every user-facing string in the new slice goes through `useTranslation()`, with matching keys added to
**all three** `apps/frontend/src/i18n/locales/{en,sv,fi}.json` in the same change (CLAUDE.md Hard Rule 8).

## 6. Tests

- `ui/*.test.tsx` for components with conditional rendering (`@testing-library/react`)
- `api/*.api.test.ts` for fetchers, against MSW handlers typed from the same `@repo/contracts` schema
- `lib/*.test.ts` for pure helpers
- A page slice with a Storybook story (`*.stories.tsx`) if the equivalent existing pages have one

## 7. Wire the route (pages only)

Add the route file under `app/router/routes/`. **Never hand-edit `routeTree.gen.ts`** (CLAUDE.md Hard
Rule 9) — it regenerates from the route file via the Vite plugin on next `pnpm dev`/`build`.

## 8. Verify

```bash
pnpm --filter frontend arch        # Steiger: layer + import-direction check
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter frontend lint
```

Then run the full `ci-verify` skill before opening the PR.
