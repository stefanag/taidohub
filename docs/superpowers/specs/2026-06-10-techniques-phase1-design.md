# Techniques (Phase 1) Design

**Date:** 2026-06-10
**Status:** Approved

A classification taxonomy + a `Technique` resource that can be tagged with
multiple categories per dimension. Phase 1 of a multi-phase product —
patterns / progress / practice log / media land in later phases.

Originating spec: user-pasted "Techniques + Patterns with Many-to-Many
Categories" (out-of-codebase). This document adapts it to the taidohub
codebase (NestJS + Drizzle + Postgres + React FSD), narrows scope to
techniques only, and resolves naming collisions with the existing labels
feature.

## 1. Goal

Let sysadmins seed and maintain a classification taxonomy, and let
sysadmins / orgadmins manage Technique rows tagged with multiple
classifications per dimension. Every authenticated user can browse the
catalogue with multi-dimension filters.

## 2. Non-goals (Phase 1)

- Patterns (Phase 2).
- Progress tracking + practice log (Phase 3).
- Media attachments (Phase 4).
- Student progression page.
- Pattern-specific roots (`pattern_type`, `hokei_subtype`) — seeded only
  when Phase 2 lands.
- Hard-delete UX for classification categories — Phase 1 supports
  `isActive=false` only.
- Forking / cloning a technique from one org to another.

## 3. Naming decisions

The codebase already has a `category` table for the labels feature (user-
created categories that can be polymorphically attached to anything). The
spec's "category" concept is a separate seeded taxonomy that techniques
get classified against. Reusing one table for both would muddle two
concerns.

**Resolved:**

- New table: `classification_category`. The taxonomy.
- New REST/URL param: `classificationIds=…` (not `categoryIds=…`) on
  filter + write payloads. Avoids ambiguity at every call-site.
- All CASL subjects, i18n keys, and React entity slices use
  `ClassificationCategory` / `classification-category` consistently.

## 4. Data model

### 4.1 `classification_category`

Holds both roots and children. One-level-deep hierarchy.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `parent_id` | uuid NULL FK → `classification_category` ON DELETE RESTRICT | NULL = root |
| `code` | text NOT NULL | stable handle; unique within `(parent_id)` |
| `name_en`, `name_sv`, `name_fi` | text NOT NULL | localised display |
| `name_ja` | text NOT NULL DEFAULT `''` | optional Japanese |
| `sort_order` | int NOT NULL DEFAULT 0 | |
| `is_active` | bool NOT NULL DEFAULT true | soft-delete flag |
| `created_at`, `updated_at` | timestamp with timezone, mode 'date' | |

**Constraints:**

- `UNIQUE (parent_id, code)` — also covers the root-level case where
  `parent_id IS NULL` (Postgres treats two NULLs as distinct by default;
  use `UNIQUE NULLS NOT DISTINCT` so root codes are also unique).
- DB-level CHECK trigger: a non-root's parent must itself be a root.
  ```sql
  -- enforced via a CHECK function or BEFORE INSERT trigger
  -- parent_id IS NULL OR (SELECT parent_id FROM classification_category WHERE id = NEW.parent_id) IS NULL
  ```
  Implementation: `BEFORE INSERT OR UPDATE` trigger that raises an
  exception if the rule is violated. The implementer can pick either
  trigger or a CHECK function depending on what's idiomatic with Drizzle.

### 4.2 `technique`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `created_by_organisation_id` | uuid NULL FK → `organisations` ON DELETE CASCADE | NULL = global (sysadmin only) |
| `created_by_user_id` | uuid NULL FK → `user` ON DELETE SET NULL | audit trail |
| `is_kihon` | bool NOT NULL DEFAULT false | |
| `is_active` | bool NOT NULL DEFAULT true | |
| `sort_order` | int NOT NULL DEFAULT 0 | |
| `min_rank_id` | uuid NULL FK → `belt_ranks` ON DELETE SET NULL | |
| `name_ja` | text NOT NULL DEFAULT `''` | |
| `name_romaji` | text NOT NULL | min length 1 enforced at the Zod layer |
| `name_sv`, `name_en`, `name_fi` | text NOT NULL DEFAULT `''` | |
| `description_sv`, `description_en`, `description_fi` | text NOT NULL DEFAULT `''` | |
| `created_at`, `updated_at` | timestamp with timezone, mode 'date' | |

### 4.3 `technique_classification` (junction)

| column | type | notes |
|---|---|---|
| `technique_id` | uuid FK → `technique` ON DELETE CASCADE | |
| `classification_category_id` | uuid FK → `classification_category` ON DELETE RESTRICT | |
| `sort_order` | int NOT NULL DEFAULT 0 | order within dimension |
| `created_at` | timestamp with timezone, mode 'date' | |

PRIMARY KEY `(technique_id, classification_category_id)`.
Index on `(classification_category_id)` to make
"techniques tagged with category X" lookups fast.

`ON DELETE RESTRICT` on `classification_category_id` is deliberate — a
soft-delete of a referenced taxonomy node uses `is_active=false`; a hard-
delete surfaces a 409 instead of silently orphaning.

## 5. Seeded taxonomy (Phase 1)

Three roots + their Taido children, inserted in migration 0018 alongside
the schema add (atomic).

| root code | children codes |
|---|---|
| `technique_type` | `taidotechnique`, `generaltechnique`, `unsoku`, `kamae`, `unshin`, `tachi` |
| `sotai_category` | `sentai`, `untai`, `hentai`, `nentai`, `tentai` |
| `attack_type` | `kick`, `punch`, `block`, `takedown`, `off_balancing`, `grabbing`, `dodge` |

Localised names per the originating spec (en / sv / fi). `name_ja` is left
`''` for now and can be filled in via the admin UI as content lands.

Pattern roots (`pattern_type`, `hokei_subtype`) are NOT seeded in Phase 1.

## 6. CASL

New subjects:

- `ClassificationCategory` — sysadmin `manage`; everyone else `read`.
- `Technique`:
  - sysadmin: `manage` (any row including globals)
  - orgadmin: `manage` when `createdByOrganisationId` ∈ caller's
    `orgadmin`-role memberships
  - everyone else (regular user, instructor-only, anonymous): `read` only

The `classification_category` table has no per-org scoping — taxonomy is
system-wide. Reading is universal so dropdowns hydrate for everyone.

## 7. Backend module shape

Two new modules, mirroring the `feature-flags` and `labels` patterns
already in the codebase:

```
apps/backend/src/modules/classification-category/
  classification-category.repository.ts
  classification-category.service.ts          # CRUD + (rootCode -> rootId) cache
  classification-category.service.spec.ts
  classification-category.controller.ts        # GET (any), PATCH (sysadmin only — rename / activate / deactivate)
  classification-category.module.ts
  classification-category.ability-rules.ts

apps/backend/src/modules/technique/
  technique.repository.ts
  technique.service.ts                         # CRUD + validateCategoryLinks
  technique.service.spec.ts
  category-guards.ts                           # resolveCategoryRoots + validateCategoryLinks
  category-guards.spec.ts
  technique.controller.ts
  technique.module.ts
  technique.ability-rules.ts
```

### 7.1 Root cache

`ClassificationCategoryService` exposes:

```ts
loadRootIdMap(): Promise<Map<RootCode, string>>
```

The map is cached for the process lifetime — roots don't change at
runtime. The cache is built lazily on first access (or in `onModuleInit`).

### 7.2 `validateCategoryLinks` (in `category-guards.ts`)

```ts
type RootCode =
  | 'technique_type'
  | 'sotai_category'
  | 'attack_type'
  // | 'pattern_type'           // Phase 2
  // | 'hokei_subtype';         // Phase 2
  ;

const TECHNIQUE_ALLOWED_ROOTS: ReadonlyArray<RootCode> = [
  'technique_type', 'sotai_category', 'attack_type',
];
const TECHNIQUE_REQUIRED_ROOT: RootCode = 'technique_type';

async function validateCategoryLinks(args: {
  classificationIds: string[];
  kind: 'technique';
}): Promise<void>;
```

Throws (in this priority order):

- `404 INVALID_CATEGORY { offendingId, reason: 'not_found' }` if any
  supplied id doesn't resolve to a `classification_category` row.
- `400 INVALID_CATEGORY { offendingId, expectedRoots }` if a supplied id's
  resolved root is not in the allowed set for the kind.
- `400 MISSING_REQUIRED_CATEGORY { requiredRoot }` if zero of the supplied
  ids resolve to `technique_type`.

Input is deduped before insert; duplicate `classificationIds` are silently
collapsed (NOT 409).

## 8. REST API

All paths are prefixed with `/api/` by the global Nest prefix.

| Method | Path | Auth | Body / Query |
|---|---|---|---|
| `GET` | `/classification-categories` | any authenticated | `?root=<code>` filters by root code; `?includeInactive=1` opts in to inactive rows |
| `PATCH` | `/classification-categories/:id` | sysadmin | `{ nameEn?, nameSv?, nameFi?, nameJa?, isActive?, sortOrder? }` — no rename of `code`, no parent change, no hard delete |
| `GET` | `/techniques` | any authenticated | `?classificationIds=<id1>,<id2>,…` (optional), `?includeInactive=1`, `?organisationId=<id>` (optional, narrows to a specific org) |
| `GET` | `/techniques/:id` | any authenticated | — |
| `POST` | `/techniques` | sysadmin OR orgadmin | `CreateTechniqueInput` (see §9.1) |
| `PATCH` | `/techniques/:id` | sysadmin (any) OR orgadmin (own org) | `UpdateTechniqueInput` |
| `DELETE` | `/techniques/:id` | sysadmin (any) OR orgadmin (own org) | — |

### 8.1 Write semantics

- POST: server stamps `createdByOrganisationId` based on the caller. A
  sysadmin can explicitly pass `organisationId: null` for a global; an
  orgadmin can only create within an org they administer (the backend
  picks the active org from the request or rejects ambiguity).
- PATCH replaces the full classification set when `classificationIds` is
  present in the body (transactional: delete-then-insert). Absent =
  unchanged. Empty array = clear (and trigger `MISSING_REQUIRED_CATEGORY`).
- DELETE cascades the junction rows; the taxonomy nodes themselves are
  untouched (RESTRICT prevents accidental deletion).

### 8.2 Filter semantics (`GET /techniques?classificationIds=…`)

- Group the supplied ids by their root code.
- For each root present in the query, the technique must link to at least
  one id in that group (OR within a root).
- The technique must satisfy every root present (AND across roots).
- Unknown ids form an empty group and are silently ignored (lenient mode
  by default). Opt-in stricter mode `?strictClassificationIds=1` returns
  400 on unknown ids.

SQL sketch:

```sql
SELECT t.* FROM technique t
WHERE EXISTS (
  SELECT 1 FROM technique_classification tc
  JOIN classification_category c ON c.id = tc.classification_category_id
  WHERE tc.technique_id = t.id
    AND c.id IN (<ids of attack_type group>)
    AND c.parent_id = (SELECT id FROM classification_category WHERE code='attack_type' AND parent_id IS NULL)
)
AND EXISTS (
  -- one EXISTS clause per root represented in the query
)
ORDER BY t.sort_order, t.created_at;
```

### 8.3 Hydrated read shape

```ts
type ClassificationCategoryRead = {
  id: string;
  code: string;
  parentId: string | null;
  rootCode: RootCode | null;           // resolved server-side
  nameEn: string;
  nameSv: string;
  nameFi: string;
  nameJa: string;
  sortOrder: number;
  isActive: boolean;
};

type TechniqueRead = {
  id: string;
  createdByOrganisationId: string | null;
  isKihon: boolean;
  isActive: boolean;
  sortOrder: number;
  minRankId: string | null;
  nameJa: string; nameRomaji: string; nameSv: string; nameEn: string; nameFi: string;
  descriptionSv: string; descriptionEn: string; descriptionFi: string;
  classificationsByRoot: {
    technique_type: ClassificationCategoryRead[];
    sotai_category: ClassificationCategoryRead[];
    attack_type:    ClassificationCategoryRead[];
  };
  // Flat list preserves cross-root submission order.
  classifications: Array<ClassificationCategoryRead & { rootCode: RootCode }>;
  createdAt: string;
  updatedAt: string;
};
```

## 9. Zod contracts

Lives in `packages/contracts/src/techniques.ts` and
`packages/contracts/src/classification-category.ts`.

### 9.1 Inputs

```ts
const TECHNIQUE_ALLOWED_ROOTS = ['technique_type', 'sotai_category', 'attack_type'] as const;
const TECHNIQUE_REQUIRED_ROOT = 'technique_type' as const;

export const CreateTechniqueSchema = z.object({
  classificationIds: z.array(z.string().uuid()).min(1),
  organisationId:    z.string().uuid().nullable().optional(),  // sysadmin-only override
  isKihon:           z.boolean().default(false),
  isActive:          z.boolean().default(true),
  sortOrder:         z.number().int().nonnegative().default(0),
  minRankId:         z.string().uuid().nullable().optional(),
  nameJa:            z.string().default(''),
  nameRomaji:        z.string().min(1),
  nameSv:            z.string().default(''),
  nameEn:            z.string().default(''),
  nameFi:            z.string().default(''),
  descriptionSv:     z.string().default(''),
  descriptionEn:     z.string().default(''),
  descriptionFi:     z.string().default(''),
}).meta({ id: 'CreateTechniqueInput' });

export const UpdateTechniqueSchema = CreateTechniqueSchema.partial()
  .meta({ id: 'UpdateTechniqueInput' });
```

### 9.2 Outputs

`TechniqueSchema` (matches §8.3) + `ClassificationCategorySchema`,
exported with `.meta({ id, description, example })` for OpenAPI.

### 9.3 CASL subject names

`packages/contracts/src/casl.ts` gains two new entries on
`SubjectSchema` (before the `'all'` wildcard):

- `'ClassificationCategory'`
- `'Technique'`

With matching `__caslSubjectType__` shape types.

## 10. Frontend

### 10.1 New entity slices

```
apps/frontend/src/entities/classification-category/
  api/classification-category.api.ts
  api/classification-category.api.test.ts
  lib/hooks.ts                                # useClassificationCategoriesByRootQuery, useUpdateClassificationCategoryMutation
  index.ts

apps/frontend/src/entities/technique/
  api/technique.api.ts
  api/technique.api.test.ts
  lib/hooks.ts                                # useTechniquesQuery(filterIds), useTechniqueQuery(id), useCreate/Update/DeleteTechniqueMutation
  index.ts
```

### 10.2 New shared primitive

`apps/frontend/src/shared/ui/classification-multi-select.tsx` — a
clickable-chip multi-select scoped to a single root. Used by both the
admin form and the filter bar.

```tsx
<ClassificationMultiSelect
  rootCode="technique_type"
  selectedIds={typeIds}
  onChange={setTypeIds}
  label={t('techniques.filters.techniqueType')}
  required
/>
```

The component reads `useClassificationCategoriesByRootQuery(rootCode)`
internally; the caller only owns the selected-id state.

### 10.3 New feature slice

`apps/frontend/src/features/technique-form/` — the create/edit dialog.
Composes three `<ClassificationMultiSelect>` instances (one per dimension)
plus the localised name/description fields and the min-rank picker.

Client-side: disable submit when `technique_type` picker is empty
(matches the server's `MISSING_REQUIRED_CATEGORY`).

### 10.4 New pages

- `apps/frontend/src/pages/techniques/` — read-only catalogue. Filter bar
  with one `<ClassificationMultiSelect>` per root (sysadmin sees all three
  rows; orgadmin/user sees the same — filters are universal). URL state:
  `?cats=<id1>,<id2>,…`. Each row shows technique name + badge list per
  root.
- `apps/frontend/src/pages/admin-techniques/` — CRUD page mounted in the
  sidebar Administration cluster, gated by `ability.can('manage',
  'Technique')`. Reuses the same filter bar; adds a "New technique"
  button → opens `TechniqueFormDialog`. Row actions: Edit, Delete.

### 10.5 New routes

- `_app.techniques.tsx` — `/techniques`, gated by session presence (the
  existing `_app` layout's check).
- `_app.admin.techniques.tsx` — `/admin/techniques`, sysadmin-or-orgadmin
  gate via the same `authClient.getSession().role` pattern that
  `_app.admin.feature-flags.tsx` uses.

### 10.6 Sidebar entries

- Main nav (NAV array): `{ to: '/techniques', icon: Swords, labelKey: 'nav.techniques' }`.
- Administration cluster: `{ to: '/admin/techniques', icon: Wrench, gate: ability.can('manage', 'Technique') }`.

Icons are placeholders — final choice can be picked at implementation
time from lucide-react.

## 11. i18n

`apps/frontend/src/i18n/locales/{en,sv,fi}.json` gain:

- `nav.techniques`, `nav.adminTechniques`
- `techniques.title`, `techniques.description`, `techniques.empty`
- `techniques.filters.{all, techniqueType, sotaiCategory, attackType, clear}`
- `techniques.form.{title, nameRomaji, nameJa, nameSv, nameEn, nameFi,
  descriptionSv, descriptionEn, descriptionFi, isKihon, minRank,
  sortOrder, isActive}`
- `techniques.errors.{missingRequiredCategory, invalidCategory,
  requiresRomaji}`
- `admin.techniques.title`, `admin.techniques.description`
- `admin.techniques.newTechnique`, `admin.techniques.editTechnique`,
  `admin.techniques.deleteConfirm`

Classification category display names come from the DB rows; no i18n
keys per taxonomy value.

## 12. Migrations

Two additive migrations:

- **0017** — schema:
  - `CREATE TABLE classification_category` + indexes + the depth CHECK
    trigger + `UNIQUE NULLS NOT DISTINCT (parent_id, code)`.
  - `CREATE TABLE technique` + FKs.
  - `CREATE TABLE technique_classification` + PK + index on
    `classification_category_id`.
- **0018** — seed: 3 roots + 18 children as a single transaction (uuid
  generation in SQL via `gen_random_uuid()`).

Both are purely additive. Idempotent re-runs aren't a goal — drizzle-kit
tracks applied migrations.

## 13. Testing

### 13.1 Backend

- `category-guards.spec.ts`: 8 cases covering the validation matrix —
  unknown id, disallowed root, missing required, dedup, all roots empty,
  legal input passes, error envelopes.
- `classification-category.service.spec.ts`: root cache populates lazily;
  PATCH respects `code` immutability; PATCH errors when called by non-
  sysadmin (CASL).
- `technique.service.spec.ts`: create→hydrate round-trip; PATCH replace
  semantics (B+C removed, D added when payload is `[A, D]`); empty
  classificationIds on PATCH → MISSING_REQUIRED_CATEGORY; CASL boundary
  (orgadmin can't write to a different org).
- `technique.controller.spec.ts` (optional): filter EXISTS query yields
  AND-across, OR-within results on a small fixture.

### 13.2 Frontend

- `ClassificationMultiSelect.test.tsx`: renders chips from the hook, click
  toggles selection, hides inactive entries by default but keeps them
  visible when pre-selected.
- `TechniqueFormDialog.test.tsx`: submit disabled until at least one
  technique_type chip is selected; submitting calls the create hook with
  `classificationIds` flattened from the three pickers.
- `pages/techniques/TechniquesPage.test.tsx`: filter chip click updates
  URL search param; the row list rerenders with the filtered hook.

## 14. Acceptance criteria (mapped from the originating spec, scoped to
techniques only)

1. POST a technique with `classificationIds: [<takedown>, <grabbing>]`
   plus one `technique_type` child → 201. GET round-trips both attack-
   type entries in `classificationsByRoot.attack_type`.
2. POST a technique with only `[<sentai>]` → 400
   `MISSING_REQUIRED_CATEGORY { requiredRoot: 'technique_type' }`.
3. PATCH `{ classificationIds: [] }` → 400 `MISSING_REQUIRED_CATEGORY`,
   no rows changed.
4. POST a technique with a `pattern_type`-rooted id (would be the case
   if Phase 2's pattern roots existed) → 400 `INVALID_CATEGORY` with
   `expectedRoots: ['technique_type','sotai_category','attack_type']`.
5. POST with `[<kick>, <kick>, <generaltechnique>]` → 201, single link
   row for `kick`.
6. PATCH replace semantics: `[A, B, C] → PATCH [A, D]` final set is
   `{A, D}`.
7. Hard-delete `kick` via DB while a technique links to it → DB error
   surfaces as 409 `CATEGORY_IN_USE`.
8. Soft-delete `kick` (`isActive=false`): existing techniques still
   hydrate with `kick`; the chip-picker hides it from new selections.
9. Rename `kick.name_en` to `Front kick`: next GET reflects the new name.
10. `GET /techniques?classificationIds=<kick>,<punch>,<sentai>` returns
    techniques tagged `attack_type ∈ {kick, punch} AND sotai_category =
    sentai`.
11. `GET /techniques?classificationIds=<unknown-uuid>` returns the full
    unfiltered list in lenient mode; returns 400 with
    `?strictClassificationIds=1`.
12. DELETE a technique → its `technique_classification` rows are gone;
    `classification_category` rows untouched.
13. INSERT into `classification_category` with a non-root parent (a
    parent whose own `parent_id IS NOT NULL`) is rejected by the depth
    trigger.
14. CASL: orgadmin in org A can `manage` technique with
    `createdByOrganisationId=A`; cannot manage one with
    `createdByOrganisationId=B`; cannot manage a global one
    (`createdByOrganisationId=null`).
15. CASL: regular user can read but cannot write any technique.

## 15. Deploy

Standard sequence:

1. Apply migration 0017 (schema add — additive, zero downtime).
2. Apply migration 0018 (taxonomy seed — additive).
3. Backend release (modules + endpoints).
4. Frontend release (pages + sidebar entries + i18n).

Frontend-first would 404 on the new endpoints — acceptable for the brief
overlap; not a data risk.

## 16. Task summary

13 tasks (see plan):

1. DB schema: `classification_category` + indexes + depth trigger
2. DB schema: `technique` + `technique_classification` (same migration 0017)
3. DB seed: 3 roots + 18 children (migration 0018)
4. Contracts: `classification-category` Zod schemas + CASL subject
5. Contracts: `techniques` Zod schemas + CASL subject + `RootCode` union
6. Backend: `ClassificationCategoryModule` (repo + service + controller + ability rules + spec)
7. Backend: `TechniqueModule` (repo + service + category-guards + controller + ability rules + spec)
8. Backend: AppModule wiring + OpenAPI regen
9. Frontend: `entities/classification-category` API + hooks
10. Frontend: `entities/technique` API + hooks
11. Frontend: `ClassificationMultiSelect` primitive + `TechniqueFormDialog`
12. Frontend: `/techniques` (read) + `/admin/techniques` (CRUD) pages + sidebar entries + routes
13. i18n + full pipeline + clean tree

May stretch to 14-15 if spec / code-quality reviewers request loops.

Out of scope (not tasks): patterns, progress tracking, practice log,
media, student progression page, sysadmin cross-org technique mover,
hard-delete UI for taxonomy nodes.
