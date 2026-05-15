# Organisations Admin — Design

**Status:** Approved (data model, backend, frontend sections confirmed by stakeholder on 2026-05-15)
**Author:** Claude (brainstormed with stefanag)
**Spec date:** 2026-05-15

## Goal

Give a sysadmin a UI to manage the federation/club hierarchy: create,
read, update, delete and reparent organisations. Surface the data as a
hierarchical tree because the structure is inherently nested
(international federation → national federation → club, with sub-clubs).

## Scope

In scope for v1:

- Full CRUD on organisations.
- Reparenting via a dedicated "Move" dialog.
- Tree-view management page at `/admin/organisations`, gated to
  `role === 'admin'`.
- i18n on the page chrome (en/sv/fi) plus localized organisation names
  stored in four parallel columns (`name_en`, `name_sv`, `name_fi`,
  `name_ja`).

Explicitly out of scope (tracked in `docs/followups.md`):

- Logo file upload (v1: plain `logo_url` text field)
- Bulk import / CSV
- Audit log of mutations
- Soft delete
- Non-admin read access to the tree

## Data model

New Drizzle table `organisations` in
`apps/backend/src/infrastructure/database/schema/organisations.ts`,
exported from the schema barrel.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, defaultRandom | Matches `posts.id` |
| `parent_id` | `uuid` | FK → `organisations(id)` ON DELETE **RESTRICT**, nullable | Can't delete a node with children |
| `type` | `text` | NOT NULL, CHECK in `('international_federation','national_federation','club')` | Immutable after create |
| `short_code` | `text` | NOT NULL | e.g. `WTF`, `STF` |
| `slug` | `text` | nullable, unique when present | URL-safe full name |
| `country` | `text` | NOT NULL, length=3, regex `^[A-Z]{3}$` | ISO 3166-1 alpha-3 |
| `name_en` | `text` | NOT NULL | |
| `name_sv` | `text` | NOT NULL | |
| `name_fi` | `text` | NOT NULL | |
| `name_ja` | `text` | nullable | Drop the reference SQL's `DEFAULT ''` |
| `logo_url` | `text` | nullable | URL string (no upload yet) |
| `address` | `text` | nullable | Freeform |
| `contact_email` | `text` | nullable, RFC 5322 when present | Drop reference SQL's `NOT NULL DEFAULT ''` |
| `head_instructor_id` | `text` | FK → `user(id)` ON DELETE SET NULL, nullable | Real foreign key |
| `created_at` | `timestamptz` | NOT NULL, defaultNow | Matches `posts` (not TEXT) |
| `updated_at` | `timestamptz` | NOT NULL, defaultNow, updated on write | Matches `posts` |

Indexes: `parent_id`, `type`, `country`. Composite **unique** on
`(country, type, short_code)` — two clubs in different countries can
share a code, two NFs in the same country cannot.

### Business rules (service layer)

- **Hierarchy ladder**:
  - `international_federation` → `parent_id` must be `null`.
  - `national_federation` → parent must exist and be an
    `international_federation`.
  - `club` → parent must exist and be either a `national_federation` or
    another `club`.
- **Cycle prevention** on update: when reparenting, walking up from the
  new parent must not reach the node being moved.
- **Type is immutable** after creation; changing type ⇒ delete +
  recreate.
- **Delete-with-children** returns `409 Conflict` with a structured
  error code (`HAS_CHILDREN`); sysadmin must reparent or delete
  children first.

## Backend module

Layout under `apps/backend/src/modules/organisations/`, mirroring the
`posts` slice:

```
organisations.module.ts
organisations.controller.ts
organisations.service.ts          // hierarchy + cycle + role gating
organisations.repository.ts       // Drizzle queries
organisations.abilities.ts        // CASL rule contributor
dto/
  organisation.dto.ts
  create-organisation.dto.ts
  update-organisation.dto.ts
  list-organisations-query.dto.ts
  list-organisations-response.dto.ts
```

### HTTP routes

All under `/api/admin/organisations`. All gated to `role === 'admin'`
via `@CheckAbility(<action>, 'Organisation')`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/organisations` | Flat list with optional `?type=`, `?country=`, `?parentId=`, `?q=` filters. Frontend assembles the tree. |
| `GET` | `/admin/organisations/:id` | Detail. |
| `POST` | `/admin/organisations` | Create. Validates hierarchy. |
| `PATCH` | `/admin/organisations/:id` | Update any field (including `parentId` — the Move dialog calls this with just `{ parentId }`). Validates hierarchy + cycle. |
| `DELETE` | `/admin/organisations/:id` | 409 if it still has children; otherwise hard delete. |

### Authorization (CASL)

```ts
// organisations.abilities.ts
if (user?.role === 'admin') builder.can('manage', 'Organisation');
```

Everyone else: no rules → endpoints respond with `403`. Wire
`OrganisationsAbilityRules` into `AbilityModule` alongside
`PostsAbilityRules` and `UsersAbilityRules`.

### Contracts

Add `packages/contracts/src/organisations/` with Zod schemas + inferred
types:

- `OrganisationSchema` (full row, timestamps as ISO strings)
- `CreateOrganisationInputSchema`
- `UpdateOrganisationInputSchema`
- `ListOrganisationsQuerySchema`
- `ListOrganisationsResponseSchema`

Re-exported as `@repo/contracts/organisations`. The type aliases
`Organisation`, `CreateOrganisationInput`, etc. are consumed by both
the backend DTOs and frontend `entities/organisation`.

### Validation specifics

- `type` validated against the enum literal at the contract layer.
- `country` validated by regex `^[A-Z]{3}$` plus an allowlist of known
  alpha-3 codes (a static `iso-3166-alpha3.ts` list in
  `packages/contracts/src/organisations/`).
- `parentId` validated as UUID at the contract layer; the strict ladder
  + existence + cycle checks live in the service.

### Tests

- **Service unit tests** (Vitest):
  - Hierarchy enforcement: IF.parent must be null; NF.parent must be IF;
    club.parent must be NF or club. Each case has a passing and a
    failing test.
  - Cycle detection: moving node A under one of its descendants throws.
  - Delete with children → `409` / `HAS_CHILDREN`.
  - Role gating: non-admin → `ForbiddenError` on every action.
- **Controller integration tests** (Nest e2e): 401/403/404/200 path
  matrix for each route.

## Frontend (Feature-Sliced Design)

### Layers

```
shared/
  lib/
    iso-countries.ts             // alpha-3 list + country-name lookup by locale
entities/
  organisation/
    api/organisations.api.ts     // typed fetchers wrapping @repo/contracts/organisations
    api/query-options.ts         // listOrganisationsQueryOptions, organisationQueryOptions
    model/types.ts               // re-export Organisation type
    lib/buildTree.ts             // flat list → tree shape (handles orphans, multi-root)
    lib/displayName.ts           // pick name_<locale> with fallback chain
    index.ts                     // barrel
features/
  organisation-form/             // create + edit (react-hook-form + Zod)
  organisation-move-dialog/      // parent picker with client-side ladder validation
  organisation-delete-dialog/    // confirm; surfaces 409 HAS_CHILDREN cleanly
widgets/
  organisation-tree/             // recursive renderer; per-row 3-dot menu
pages/
  admin-organisations/
    ui/AdminOrganisationsPage.tsx
    ui/AdminOrganisationsPage.stories.tsx
```

### Route + nav

- New route file:
  `apps/frontend/src/app/router/routes/_app.admin.organisations.tsx`,
  nested under the `_app` auth-gated layout.
- The route's `beforeLoad` additionally checks `role === 'admin'` and
  redirects to `/dashboard` on mismatch — defense-in-depth on top of
  the backend gate.
- Extend `widgets/appsidebar/ui/AppSidebar.tsx` with a new
  `SidebarGroup` labeled "Admin", visible only when
  `can('manage', 'Organisation')`. Its first entry is "Organisations" →
  `/admin/organisations`. Future admin pages slot under the same group.

### Page behaviour

- Fetch the flat list via `useQuery(listOrganisationsQueryOptions())`.
- Memoize `buildTree(rows)`.
- Render `<OrganisationTree>` with expandable nodes. Each row has a
  `<DropdownMenu>` with **Edit**, **Move**, **Delete**.
- The page header has a "New organisation" button → opens the form in
  create mode (same component used by Edit).
- All mutations (`useMutation`) invalidate the list query on success.
- The form has locale-tabbed name inputs (En / Sv / Fi / Ja) so all
  four names go in one place.

### i18n

Add keys to `apps/frontend/src/i18n/locales/{en,sv,fi}.json` under
`admin.organisations.*`:

- `title`, `newOrganisation`
- `actions.edit`, `actions.move`, `actions.delete`
- `types.internationalFederation`, `types.nationalFederation`,
  `types.club`
- `fields.shortCode`, `fields.slug`, `fields.country`,
  `fields.nameEn/Sv/Fi/Ja`, `fields.address`, `fields.contactEmail`,
  `fields.logoUrl`, `fields.headInstructor`, `fields.parent`
- `confirm.delete`, `errors.hasChildren`, `errors.invalidParent`,
  `errors.cycle`

`displayName(org, locale)` returns `org.name_<locale>` and falls back
en → first non-empty.

### Tests

- `entities/organisation/lib/buildTree.test.ts` — flat→tree, orphans,
  multiple roots.
- `widgets/organisation-tree/ui/OrganisationTree.test.tsx` — renders
  nested, expand/collapse, per-row menu actions invoke handlers.
- `features/organisation-form/ui/OrganisationForm.test.tsx` — Zod
  validation, submit payload shape.
- `widgets/appsidebar/ui/AppSidebar.test.tsx` — extend: admin group
  only renders for `role === 'admin'`.

## Migration

A single Drizzle migration creates the table and indexes. No data
migration; v1 starts empty (sysadmin will create rows from the UI or via
a future seed script).
