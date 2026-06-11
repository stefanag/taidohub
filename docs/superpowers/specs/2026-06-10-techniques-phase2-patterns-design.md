# Techniques (Phase 2 — Patterns) Design

**Date:** 2026-06-10
**Status:** Approved

Adds a `Pattern` resource that classifies against the existing
`classification_category` taxonomy via a new junction table. Two new
taxonomy roots (`pattern_type`, `hokei_subtype`) get seeded. Mirrors
Phase 1's shape almost completely; the user-facing delta is the
conditional `hokei_subtype` picker.

Originating spec: user-pasted "Techniques + Patterns with Many-to-Many
Categories" (out-of-codebase). This document scopes the patterns half of
it for the taidohub codebase, building on top of Phase 1 (techniques)
that landed at commit `9414339`.

Phase 1 spec: `docs/superpowers/specs/2026-06-10-techniques-phase1-design.md`.

## 1. Goal

Let sysadmins / orgadmins manage a Pattern catalogue with multi-
dimensional classification (pattern_type + hokei_subtype). Every
authenticated user browses the catalogue with the same filter UX as
techniques.

## 2. Non-goals (Phase 2)

- Progress tracking on patterns (deferred to Phase 3).
- Practice log on patterns (deferred to Phase 3).
- Media attachments to patterns (deferred to Phase 4).
- New top-level admin surface — patterns share the existing
  Administration sidebar cluster.
- Forking / cloning a pattern across orgs.
- Migrating any existing data — patterns is greenfield.

## 3. Reused from Phase 1

- `classification_category` table — no schema change. Roots and children
  for the new dimensions land via additive seed migration.
- `ClassificationMultiSelect` shared primitive — already data-pure.
- Validation pattern — `validateCategoryLinks` refactored to accept the
  kind + per-kind allowed/required roots as parameters (was `kind: 'technique'`
  hard-coded; becomes generic).
- `entities/classification-category` API — `RootCode` union extended to
  include the two new codes.
- Frontend FSD slice shape: `entities/pattern` + `features/pattern-form`
  + `pages/{patterns, admin-patterns}` + routes + sidebar entries.
- Audit log integration — same `auditLog.record({ entityType: 'pattern', ... })`
  calls inside the same transaction as the mutation.
- CASL — same role / membership-conditional structure as `Technique`.

## 4. Data model

### 4.1 Taxonomy additions (no schema change)

Two new roots inserted into `classification_category` via migration 0019,
each with their child rows. The depth-CHECK trigger from Phase 1 covers
correctness; no new constraints needed.

| root code | children codes |
|---|---|
| `pattern_type` | `hokei`, `kobo`, `unsoku_pattern`, `unshin_pattern`, `rengi`, `other` |
| `hokei_subtype` | `yo`, `in`, `sei`, `mei`, `gen`, `other` |

Localised names per the originating spec (en / sv / fi). `name_ja` left
`''` initially; sysadmin can edit via the existing PATCH endpoint.

### 4.2 `pattern` (new table, migration 0020)

Mirrors `technique` with one extra field:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom` |
| `created_by_organisation_id` | uuid NULL FK → `organisations` ON DELETE CASCADE | NULL = global |
| `created_by_user_id` | text NULL FK → `user.id` ON DELETE SET NULL | audit trail |
| `official_body_org_id` | uuid NULL FK → `organisations` ON DELETE SET NULL | which org maintains the canon (e.g. All Japan Taido Association). Independent of `created_by_organisation_id`. |
| `is_active` | bool NOT NULL DEFAULT true | |
| `sort_order` | int NOT NULL DEFAULT 0 | |
| `min_rank_id` | uuid NULL FK → `belt_ranks` ON DELETE SET NULL | |
| `name_ja` | text NOT NULL DEFAULT `''` | |
| `name_romaji` | text NOT NULL | Zod min(1) |
| `name_sv`, `name_en`, `name_fi` | text NOT NULL DEFAULT `''` | |
| `description_sv`, `description_en`, `description_fi` | text NOT NULL DEFAULT `''` | |
| `created_at`, `updated_at` | timestamp with timezone, mode 'date' | |

Note: patterns do NOT have `is_kihon` — that's a technique concept.

### 4.3 `pattern_classification` (junction, migration 0020)

Identical shape to `technique_classification`:

| column | type | notes |
|---|---|---|
| `pattern_id` | uuid FK → `pattern` ON DELETE CASCADE | |
| `classification_category_id` | uuid FK → `classification_category` ON DELETE RESTRICT | |
| `sort_order` | int NOT NULL DEFAULT 0 | submission order within dimension |
| `created_at` | timestamp | |

PRIMARY KEY `(pattern_id, classification_category_id)`. Index on
`classification_category_id`.

## 5. CASL

New subject `Pattern` with the same rule shape as `Technique`:

- sysadmin: `manage` (any row including globals)
- orgadmin: `manage` when `createdByOrganisationId` is in their orgadmin
  memberships; `create` unconditional
- everyone authenticated: `read`

Subject shape:

```ts
export type PatternSubjectShape = {
  readonly __caslSubjectType__: 'Pattern';
  createdByOrganisationId?: string | null;
};
```

## 6. REST API

All paths prefixed with `/api/` by the global Nest prefix.

| Method | Path | Auth | Body / Query |
|---|---|---|---|
| `GET` | `/patterns` | any authenticated | `?classificationIds=…`, `?includeInactive=1`, `?organisationId=…`, `?strictClassificationIds=1` |
| `GET` | `/patterns/:id` | any authenticated | — |
| `POST` | `/patterns` | sysadmin OR orgadmin | `CreatePatternInput` |
| `PATCH` | `/patterns/:id` | sysadmin (any) OR orgadmin (own org) | `UpdatePatternInput` |
| `DELETE` | `/patterns/:id` | sysadmin (any) OR orgadmin (own org) | — |

Replace-set semantics on `classificationIds`, same as techniques. The
service runs the same multi-dimension EXISTS filter for `GET /patterns`.

### 6.1 Hydrated read shape

```ts
type PatternRead = {
  id: string;
  createdByOrganisationId: string | null;
  officialBodyOrgId: string | null;
  isActive: boolean;
  sortOrder: number;
  minRankId: string | null;
  nameJa: string; nameRomaji: string; nameSv: string; nameEn: string; nameFi: string;
  descriptionSv: string; descriptionEn: string; descriptionFi: string;
  classificationsByRoot: {
    pattern_type:   ClassificationCategoryRead[];
    hokei_subtype:  ClassificationCategoryRead[];
  };
  classifications: Array<ClassificationCategoryRead & { rootCode: RootCode }>;
  createdAt: string; updatedAt: string;
};
```

Only two roots in `classificationsByRoot`. The shared
`ClassificationCategoryRead` type already carries `rootCode`.

## 7. Backend module shape

```
apps/backend/src/modules/pattern/
  pattern.repository.ts
  pattern.service.ts                  # CRUD + validateCategoryLinks(kind: 'pattern')
  pattern.service.spec.ts
  pattern.controller.ts
  pattern.module.ts
  pattern.ability-rules.ts
  pattern.ability-rules.spec.ts
```

### 7.1 Shared category-guards refactor

Phase 1's `apps/backend/src/modules/technique/category-guards.ts` is
moved to `apps/backend/src/modules/classification-category/category-guards.ts`
(or a shared neighbour). Signature becomes:

```ts
export type GuardKind = 'technique' | 'pattern';

export async function validateCategoryLinks(
  classifications: ClassificationCategoryService,
  args: {
    classificationIds: string[];
    kind: GuardKind;
  },
): Promise<void>;
```

Internally:

```ts
const ALLOWED: Record<GuardKind, readonly RootCode[]> = {
  technique: TECHNIQUE_ALLOWED_ROOTS,
  pattern:   PATTERN_ALLOWED_ROOTS,
};
const REQUIRED: Record<GuardKind, RootCode> = {
  technique: TECHNIQUE_REQUIRED_ROOT,
  pattern:   PATTERN_REQUIRED_ROOT,
};
```

Same error envelopes (`INVALID_CATEGORY`, `MISSING_REQUIRED_CATEGORY`).

### 7.2 `hokei_subtype` is conventional, not enforced

A pattern with `hokei_subtype` links but NO `hokei`-coded `pattern_type`
link is accepted by the backend (round-trips intact). The UI hides the
subtype controls when no `hokei` pattern_type is selected; that's
presentation-only. Backend rejects only:

- Any classification id whose root isn't in `{pattern_type, hokei_subtype}`
- A create/update that leaves the pattern with zero `pattern_type` links

## 8. Contracts (Zod)

### 8.1 RootCode extension

`packages/contracts/src/classification-category.ts`:

```ts
export const ROOT_CODES = [
  'technique_type', 'sotai_category', 'attack_type',
  'pattern_type', 'hokei_subtype',
] as const;
```

The existing schema's enum just inherits the extended array.

### 8.2 patterns module

`packages/contracts/src/patterns.ts`:

```ts
export const PATTERN_ALLOWED_ROOTS = ['pattern_type', 'hokei_subtype'] as const;
export const PATTERN_REQUIRED_ROOT = 'pattern_type' as const;

export const PatternSchema = z.object({
  id: z.string().uuid(),
  createdByOrganisationId: z.string().uuid().nullable(),
  officialBodyOrgId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  minRankId: z.string().uuid().nullable(),
  nameJa: z.string(),
  nameRomaji: z.string(),
  nameSv: z.string(), nameEn: z.string(), nameFi: z.string(),
  descriptionSv: z.string(), descriptionEn: z.string(), descriptionFi: z.string(),
  classificationsByRoot: z.object({
    pattern_type:  z.array(ClassificationCategorySchema),
    hokei_subtype: z.array(ClassificationCategorySchema),
  }),
  classifications: z.array(ClassificationCategorySchema.extend({ rootCode: RootCodeSchema })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'Pattern' });

export const CreatePatternSchema = z.object({
  classificationIds: z.array(z.string().uuid()).min(1),
  organisationId: z.string().uuid().nullable().optional(),
  officialBodyOrgId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
  minRankId: z.string().uuid().nullable().optional(),
  nameJa: z.string().default(''),
  nameRomaji: z.string().min(1),
  nameSv: z.string().default(''),
  nameEn: z.string().default(''),
  nameFi: z.string().default(''),
  descriptionSv: z.string().default(''),
  descriptionEn: z.string().default(''),
  descriptionFi: z.string().default(''),
}).meta({ id: 'CreatePatternInput' });

export const UpdatePatternSchema = CreatePatternSchema.partial()
  .meta({ id: 'UpdatePatternInput' });
```

### 8.3 CASL

Add `'Pattern'` to `SubjectSchema` before `'all'`; add `PatternSubjectShape`
type; add to the `AppSubject` union.

## 9. Frontend

### 9.1 New entity slice

```
apps/frontend/src/entities/pattern/
  api/pattern.api.ts                  # getPatterns, getPattern, createPattern, updatePattern, deletePattern
  api/pattern.api.test.ts
  lib/hooks.ts                        # usePatternsQuery, usePatternQuery, useCreate/Update/DeletePatternMutation
  index.ts
```

### 9.2 New feature slice

```
apps/frontend/src/features/pattern-form/
  ui/PatternFormDialog.tsx            # conditional hokei_subtype picker
  ui/PatternFormDialog.test.tsx
  index.ts
```

### 9.3 Conditional hokei_subtype UI

Inside `PatternFormDialog`:

```tsx
const typeOpts = useClassificationCategoriesByRootQuery('pattern_type');
const subtypeOpts = useClassificationCategoriesByRootQuery('hokei_subtype');
const hokeiTypeId = typeOpts.data?.find((o) => o.code === 'hokei')?.id;
const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

// Clear subtypeIds when picker becomes hidden so we don't submit stale state.
React.useEffect(() => {
  if (!showSubtype && subtypeIds.length > 0) setSubtypeIds([]);
}, [showSubtype]);

const classificationIds = [...typeIds, ...(showSubtype ? subtypeIds : [])];
const canSubmit = typeIds.length > 0 && nameRomaji.trim().length > 0;
```

When the dialog opens to edit an existing pattern that already has
subtype links, `subtypeIds` is initialised from
`pattern.classificationsByRoot.hokei_subtype`. The picker becomes visible
the moment a `hokei` pattern_type chip is selected.

### 9.4 New pages

- `apps/frontend/src/pages/patterns/` — read-only catalogue. Two
  `ClassificationMultiSelect` rows (`pattern_type` + conditional
  `hokei_subtype`). Filter conditional rendering follows the same
  visibility rule.
- `apps/frontend/src/pages/admin-patterns/` — CRUD page mirroring
  `admin-techniques`. "New pattern" button + per-row edit/delete actions
  → `PatternFormDialog`.

### 9.5 Routes

- `_app.patterns.tsx` — any authenticated user.
- `_app.admin.patterns.tsx` — sysadmin (matches `_app.admin.techniques.tsx`
  pattern; orgadmin gating waits for CASL frontend extension).

### 9.6 Sidebar

- Main NAV: `Patterns` entry below `Techniques`, icon `BookOpen`.
- Administration cluster: `/admin/patterns` gated by
  `ability?.can('create', 'Pattern')`, icon `LibraryBig`.

### 9.7 `officialBodyOrgId` UX

Phase 2 ships a simple text input for this field on the form (free-text
uuid, optional). A proper organisation picker is a polish pass; for
launch it's enough that the field round-trips through the API and is
visible/editable to sysadmins.

## 10. i18n

`apps/frontend/src/i18n/locales/{en,sv,fi}.json` gain:

- `nav.patterns`, `nav.adminPatterns`
- `patterns.title`, `patterns.description`, `patterns.empty`
- `patterns.filters.{all, patternType, hokeiSubtype, clear}`
- `patterns.form.{title, newTitle, nameRomaji, nameJa, nameSv, nameEn,
  nameFi, descriptionSv, descriptionEn, descriptionFi, officialBodyOrgId,
  minRank, sortOrder, isActive}`
- `patterns.errors.{missingRequiredCategory, invalidCategory,
  requiresRomaji}`
- `admin.patterns.{title, description, newPattern, editPattern,
  deleteConfirm}`

## 11. Migrations

Two additive migrations:

- **0019** — seed pattern_type + hokei_subtype roots + their children.
  Pure data; no schema change.
- **0020** — schema: `pattern` + `pattern_classification` tables, FKs,
  PK on junction, index on `classification_category_id`.

Order matters because the schema migration could in principle run first
and the seed second — but both are additive and independent of each
other. Drizzle's per-migration mechanic doesn't care; pick numbering
based on which runs more naturally first. Recommended: **0019 seed first**
(it just touches existing tables), then **0020 schema** for the new
pattern tables.

Apply via: `pnpm --filter backend run db:migrate`.

## 12. Testing

### 12.1 Backend

- Refactored `category-guards.spec.ts`: same 8 tests as Phase 1, parameterised by `kind`. Plus 4 new pattern-specific cases (allowed roots, required root, dedupe, hokei_subtype without hokei pattern_type is allowed).
- `pattern.service.spec.ts`: 8 cases mirroring `technique.service.spec.ts` (CASL, validation, replace-set, hydration round-trip, delete cascade).
- `pattern.ability-rules.spec.ts`: 4 cases (sysadmin, orgadmin same-org, orgadmin different-org, regular user).

### 12.2 Frontend

- `pattern.api.test.ts`: 5 cases (list, list with filter, get, create, delete).
- `PatternFormDialog.test.tsx`: 4 cases
  - submit disabled until pattern_type + romaji
  - hokei_subtype picker hidden when no hokei selected
  - hokei_subtype picker appears after selecting hokei pattern_type
  - selecting subtype then deselecting hokei clears subtype selection on submit
- `patterns/PatternsPage.test.tsx`: 2 cases (render + classification badges).
- `admin-patterns/AdminPatternsPage.test.tsx`: 2 cases (renders New button + opens dialog).

## 13. Acceptance criteria

Mirror Phase 1's 15 criteria mapped to patterns, plus:

- POST a pattern with `[<hokei>, <yo>]` (hokei pattern_type + yo
  hokei_subtype) → 201, round-trips both links.
- POST a pattern with `[<kobo>, <yo>]` (kobo pattern_type, no hokei
  selected, but yo subtype anyway) → 201 (backend accepts; UI would hide
  the subtype picker but data is preserved).
- Frontend: PatternFormDialog shows hokei_subtype picker when `hokei`
  pattern_type is selected; hides + clears subtype state otherwise.

## 14. Task summary

12 tasks (see plan):

1. DB: `pattern` + `pattern_classification` schemas + migration 0020
2. DB: seed pattern_type + hokei_subtype roots + children (migration 0019)
3. Contracts: extend `RootCode` union + add `PATTERN_ALLOWED_ROOTS` constants in `classification-category.ts`
4. Contracts: `Pattern` schemas + CASL subject
5. Backend: refactor `category-guards.ts` to be kind-agnostic + relocate
6. Backend: `PatternModule` (repo + service + controller + ability rules + spec)
7. Backend: AppModule wiring + AbilityFactory + OpenAPI regen
8. Frontend: `entities/pattern` API + hooks
9. Frontend: `PatternFormDialog` with conditional hokei UI
10. Frontend: `/patterns` + `/admin/patterns` pages + sidebar entries + routes
11. i18n keys (en/sv/fi)
12. Full pipeline + clean tree

May stretch to 13-14 if the category-guards refactor (Task 5) touches more
sites than expected.

## 15. Deploy

1. Apply migration 0019 (seed — pure inserts).
2. Apply migration 0020 (schema add — additive).
3. Backend release (PatternModule + extended guards).
4. Frontend release (entity + form + pages + sidebar + i18n).

Frontend-first would 404 on the new endpoints — acceptable for the brief
overlap.
