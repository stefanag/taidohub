# Techniques (Phase 2 — Patterns) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `Pattern` as a classification-driven resource that mirrors Phase 1's `Technique` shape almost exactly, plus a conditional `hokei_subtype` UI: the subtype chip picker is visible only when at least one selected `pattern_type` chip is `hokei`.

**Architecture:** Reuse the Phase 1 `classification_category` table; add two new roots (`pattern_type`, `hokei_subtype`) via a seed migration. New `pattern` + `pattern_classification` tables mirror `technique` + `technique_classification`, with one extra `officialBodyOrgId` field on `pattern`. Backend gets a `PatternModule` that shares the (refactored) `category-guards.ts` helper with the technique module. Frontend gets `entities/pattern`, `features/pattern-form` (with the conditional hokei picker), `/patterns` and `/admin/patterns` pages, sidebar entries, i18n.

**Tech Stack:** NestJS 11 · Drizzle ORM 0.45.2 + Postgres 15 · Zod 4.4.3 · CASL 6 · React 19 + TanStack Router + TanStack Query · shadcn primitives.

**Spec:** `docs/superpowers/specs/2026-06-10-techniques-phase2-patterns-design.md` (commit `b51d9a0`)

**Phase 1 baseline (techniques):** `docs/superpowers/specs/2026-06-10-techniques-phase1-design.md`. Phase 1 commits `f330781..9414339`.

---

## File Map

**Created:**
- `apps/backend/drizzle/0019_seed_pattern_taxonomy.sql`
- `apps/backend/drizzle/0020_*.sql` (auto-generated)
- `apps/backend/src/infrastructure/database/schema/pattern.ts`
- `apps/backend/src/modules/classification-category/category-guards.ts` (moved from `modules/technique/`)
- `apps/backend/src/modules/classification-category/category-guards.spec.ts` (moved)
- `apps/backend/src/modules/pattern/pattern.repository.ts`
- `apps/backend/src/modules/pattern/pattern.service.ts`
- `apps/backend/src/modules/pattern/pattern.service.spec.ts`
- `apps/backend/src/modules/pattern/pattern.controller.ts`
- `apps/backend/src/modules/pattern/pattern.module.ts`
- `apps/backend/src/modules/pattern/pattern.ability-rules.ts`
- `apps/backend/src/modules/pattern/pattern.ability-rules.spec.ts`
- `packages/contracts/src/patterns.ts`
- `apps/frontend/src/entities/pattern/api/pattern.api.ts`
- `apps/frontend/src/entities/pattern/api/pattern.api.test.ts`
- `apps/frontend/src/entities/pattern/lib/hooks.ts`
- `apps/frontend/src/entities/pattern/index.ts`
- `apps/frontend/src/features/pattern-form/ui/PatternFormDialog.tsx`
- `apps/frontend/src/features/pattern-form/ui/PatternFormDialog.test.tsx`
- `apps/frontend/src/features/pattern-form/index.ts`
- `apps/frontend/src/pages/patterns/ui/PatternsPage.tsx`
- `apps/frontend/src/pages/patterns/ui/PatternsPage.test.tsx`
- `apps/frontend/src/pages/patterns/index.ts`
- `apps/frontend/src/pages/admin-patterns/ui/AdminPatternsPage.tsx`
- `apps/frontend/src/pages/admin-patterns/ui/AdminPatternsPage.test.tsx`
- `apps/frontend/src/pages/admin-patterns/index.ts`
- `apps/frontend/src/app/router/routes/_app.patterns.tsx`
- `apps/frontend/src/app/router/routes/_app.admin.patterns.tsx`

**Modified:**
- `packages/contracts/src/classification-category.ts` (extend `ROOT_CODES`)
- `packages/contracts/src/casl.ts` (add `Pattern` subject + shape)
- `packages/contracts/src/index.ts` (re-export `patterns`)
- `packages/contracts/src/openapi.ts` (register `PatternOpenApiRegistry`)
- `packages/contracts/tsup.config.ts` + `package.json` (new entry)
- `apps/backend/src/infrastructure/database/schema/index.ts` (re-export `pattern.ts`)
- `apps/backend/src/modules/technique/technique.service.ts` (import path of `category-guards` updated)
- `apps/backend/src/modules/technique/technique.module.ts` (if it imported from the old path)
- Deleted: `apps/backend/src/modules/technique/category-guards.ts` + `.spec.ts` (relocated to shared place)
- `apps/backend/src/app.module.ts` (register `PatternModule`)
- `apps/backend/src/infrastructure/ability/ability.factory.ts` (`@Optional` inject `PatternAbilityRules`)
- `apps/backend/src/infrastructure/ability/ability.module.ts` (register `PatternAbilityRules`)
- `packages/contracts/openapi/openapi.{yaml,json}` (regenerated)
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` (two new entries)
- `apps/frontend/src/app/router/routeTree.gen.ts` (regenerated or hand-edited)
- `apps/frontend/src/i18n/locales/{en,sv,fi}.json` (new keys)

---

## Task 1: DB — `pattern` + `pattern_classification` schemas + migration 0020

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/pattern.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Create: `apps/backend/drizzle/0020_*.sql` (auto-generated)

Mirror Phase 1's `technique.ts` (`f330781`) exactly. Key differences:

- No `is_kihon` column.
- One extra column: `officialBodyOrgId: uuid('official_body_org_id').references(() => organisations.id, { onDelete: 'set null' })` — nullable.

The junction table `pattern_classification` has identical shape to `technique_classification`, just FKs to `pattern` instead.

- [ ] **Step 1: Schema — pattern.ts**

```ts
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { classificationCategory } from './classification-category.js';
import { organisations } from './organisations.js';
import { user } from './users.js';

export const pattern = pgTable('pattern', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdByOrganisationId: uuid('created_by_organisation_id').references(
    () => organisations.id,
    { onDelete: 'cascade' },
  ),
  createdByUserId: text('created_by_user_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  officialBodyOrgId: uuid('official_body_org_id').references(() => organisations.id, {
    onDelete: 'set null',
  }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  minRankId: uuid('min_rank_id').references(() => beltRanks.id, { onDelete: 'set null' }),
  nameJa: text('name_ja').notNull().default(''),
  nameRomaji: text('name_romaji').notNull(),
  nameSv: text('name_sv').notNull().default(''),
  nameEn: text('name_en').notNull().default(''),
  nameFi: text('name_fi').notNull().default(''),
  descriptionSv: text('description_sv').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  descriptionFi: text('description_fi').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const patternClassification = pgTable(
  'pattern_classification',
  {
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => pattern.id, { onDelete: 'cascade' }),
    classificationCategoryId: uuid('classification_category_id')
      .notNull()
      .references(() => classificationCategory.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.patternId, table.classificationCategoryId] }),
    categoryIdx: index('pattern_classification_category_idx').on(table.classificationCategoryId),
  }),
);

export type DbPattern = typeof pattern.$inferSelect;
export type DbNewPattern = typeof pattern.$inferInsert;
export type DbPatternClassification = typeof patternClassification.$inferSelect;
export type DbNewPatternClassification = typeof patternClassification.$inferInsert;
```

- [ ] **Step 2: Re-export from schema/index.ts**

Append:
```ts
export * from './pattern.js';
```

- [ ] **Step 3: Generate migration**

```
cd apps/backend && npx drizzle-kit generate
```

Expected: `apps/backend/drizzle/0020_<adjective>_<noun>.sql` with `CREATE TABLE pattern` + `CREATE TABLE pattern_classification` + FKs + composite PK + index.

- [ ] **Step 4: Typecheck + tests**

```
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: 311/311 still pass; typecheck clean.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/infrastructure/database/schema/pattern.ts \
        apps/backend/src/infrastructure/database/schema/index.ts \
        apps/backend/drizzle/0020_*.sql \
        apps/backend/drizzle/meta/
git commit -m "feat(db): pattern + pattern_classification (migration 0020)"
```

---

## Task 2: DB — seed pattern_type + hokei_subtype roots (migration 0019)

**Files:**
- Create: `apps/backend/drizzle/0019_seed_pattern_taxonomy.sql`
- Modify: `apps/backend/drizzle/meta/_journal.json` (append entry)
- Possibly Create: `apps/backend/drizzle/meta/0019_snapshot.json` (dup of `0018_snapshot.json`)

Mirror the structure of Phase 1's Task 2 (`d4217f3`):

- [ ] **Step 1: Write the seed SQL**

```sql
-- pgcrypto safety check (Phase 1 migration 0018 already ensures this; redundant but harmless).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Roots
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
VALUES
  (gen_random_uuid(), NULL, 'pattern_type',  'Pattern type',  'Mönstertyp',     'Kuviotyyppi',     '', 4, true),
  (gen_random_uuid(), NULL, 'hokei_subtype', 'Hokei subtype', 'Hokei-undertyp', 'Hokei-alatyyppi', '', 5, true);
--> statement-breakpoint

-- pattern_type children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('hokei',           'Hokei',           'Hokei',           'Hokei',          0),
  ('kobo',            'Kobo',            'Kobo',            'Kobo',           1),
  ('unsoku_pattern',  'Unsoku pattern',  'Unsoku-mönster',  'Unsoku-kuvio',   2),
  ('unshin_pattern',  'Unshin pattern',  'Unshin-mönster',  'Unshin-kuvio',   3),
  ('rengi',           'Rengi',           'Rengi',           'Rengi',          4),
  ('other',           'Other',           'Annat',           'Muu',            5)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'pattern_type' AND r."parent_id" IS NULL;
--> statement-breakpoint

-- hokei_subtype children
INSERT INTO "classification_category" ("id", "parent_id", "code", "name_en", "name_sv", "name_fi", "name_ja", "sort_order", "is_active")
SELECT gen_random_uuid(), r."id", v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM "classification_category" r
CROSS JOIN (VALUES
  ('yo',    'Yo (陽)',  'Yo (陽)',  'Yo (陽)',  0),
  ('in',    'In (陰)',  'In (陰)',  'In (陰)',  1),
  ('sei',   'Sei (制)', 'Sei (制)', 'Sei (制)', 2),
  ('mei',   'Mei (命)', 'Mei (命)', 'Mei (命)', 3),
  ('gen',   'Gen (玄)', 'Gen (玄)', 'Gen (玄)', 4),
  ('other', 'Other',    'Annat',    'Muu',      5)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r."code" = 'hokei_subtype' AND r."parent_id" IS NULL;
```

**Important — child code collision:** both `pattern_type` and `hokei_subtype` have a child with code `'other'`. The UNIQUE NULLS NOT DISTINCT constraint is on `(parent_id, code)`, so different parents may share the same child code — no conflict.

- [ ] **Step 2: Journal entry + snapshot**

Mirror Task 2 from Phase 1 (`d4217f3`):
1. Read `_journal.json`. Append entry idx=19, tag `0019_seed_pattern_taxonomy`, `when = previous_when + 1000`.
2. Duplicate `0018_snapshot.json` → `0019_snapshot.json` (schema is unchanged after this data-only migration). Rewire `id` to a fresh uuid and `prevId` to 0018's `id`.

- [ ] **Step 3: Order vs migration 0020**

Migrations are applied in numeric order. 0019 (seed) MUST run before any code reads roots by code (Phase 1's seeded roots are sufficient for the techniques code; 0019 just adds two more). 0020 (pattern table) can run after — they're independent.

- [ ] **Step 4: Apply locally**

```
pnpm --filter backend run db:migrate
```

Expected: clean exit. Sanity check `SELECT code FROM classification_category WHERE parent_id IS NULL ORDER BY sort_order;` — should now list `technique_type, sotai_category, attack_type, pattern_type, hokei_subtype`.

- [ ] **Step 5: Verify backend still builds**

```
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: 311/311.

- [ ] **Step 6: Commit**

```
git add apps/backend/drizzle/0019_seed_pattern_taxonomy.sql apps/backend/drizzle/meta/
git commit -m "feat(db): seed pattern_type + hokei_subtype taxonomy (migration 0019)"
```

---

## Task 3: Contracts — extend `RootCode` union + add `PATTERN_*` constants

**Files:**
- Modify: `packages/contracts/src/classification-category.ts`

- [ ] **Step 1: Extend ROOT_CODES**

```ts
export const ROOT_CODES = [
  'technique_type', 'sotai_category', 'attack_type',
  'pattern_type', 'hokei_subtype',
] as const;
```

The `RootCodeSchema = z.enum(ROOT_CODES)` derivation picks up the change automatically; `RootCode` type widens to include the two new strings. No other change needed in this file.

- [ ] **Step 2: Verify Phase 1 callers still compile**

```
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
pnpm --filter @repo/contracts build
```

Expected: 173/173, typecheck clean, build emits new dist. Phase 1's `TECHNIQUE_ALLOWED_ROOTS` (in `techniques.ts`) is the literal `['technique_type', 'sotai_category', 'attack_type']` tuple — type-narrow against the wider `RootCode` union, no issue.

If the backend `category-guards.ts` (Phase 1) imports `RootCode` and uses it in a `switch` / `Record<RootCode, ...>` pattern, the wider union may cause exhaustiveness errors. Check after refactor (Task 5). For Task 3 itself, the contracts package alone must typecheck — it does.

- [ ] **Step 3: Commit**

```
git add packages/contracts/src/classification-category.ts
git commit -m "feat(contracts): extend RootCode union with pattern_type + hokei_subtype"
```

---

## Task 4: Contracts — `patterns` module + CASL `Pattern` subject

**Files:**
- Create: `packages/contracts/src/patterns.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/openapi.ts`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/package.json`

Mirror Phase 1's `techniques.ts` (`059cbf8`) closely.

- [ ] **Step 1: patterns.ts**

```ts
import { z } from 'zod';

import {
  ClassificationCategorySchema,
  RootCodeSchema,
} from './classification-category.js';

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
}).meta({
  id: 'Pattern',
  description: 'A classified pattern catalogue entry. Multiple classifications per dimension allowed.',
  example: {
    id: '33333333-3333-4333-8333-333333333333',
    createdByOrganisationId: null,
    officialBodyOrgId: null,
    isActive: true,
    sortOrder: 0,
    minRankId: null,
    nameJa: '',
    nameRomaji: 'sei no hokei',
    nameSv: 'Sei no hokei', nameEn: 'Sei no hokei', nameFi: 'Sei no hokei',
    descriptionSv: '', descriptionEn: '', descriptionFi: '',
    classificationsByRoot: { pattern_type: [], hokei_subtype: [] },
    classifications: [],
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
  },
});

export const CreatePatternSchema = z.object({
  classificationIds: z.array(z.string().uuid()).min(1, 'at least one classification required'),
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
}).meta({
  id: 'CreatePatternInput',
  description: 'Body for POST /api/patterns. Backend additionally enforces that at least one classification id resolves to the pattern_type root.',
});

export const UpdatePatternSchema = CreatePatternSchema.partial().meta({
  id: 'UpdatePatternInput',
  description: 'Body for PATCH /api/patterns/:id. classificationIds is REPLACE-semantics when present.',
});

export type Pattern = z.infer<typeof PatternSchema>;
export type CreatePatternInput = z.infer<typeof CreatePatternSchema>;
export type UpdatePatternInput = z.infer<typeof UpdatePatternSchema>;

export const PatternOpenApiRegistry = {
  Pattern: PatternSchema,
  CreatePatternInput: CreatePatternSchema,
  UpdatePatternInput: UpdatePatternSchema,
} as const;
```

- [ ] **Step 2: CASL — `Pattern` subject + shape**

In `packages/contracts/src/casl.ts`:
1. Add `'Pattern'` to `SubjectSchema` enum before `'all'`.
2. Add to the `AppSubject` union.
3. Add the shape type:

```ts
export type PatternSubjectShape = {
  readonly __caslSubjectType__: 'Pattern';
  createdByOrganisationId?: string | null;
};
```

Match the exact style of `TechniqueSubjectShape`.

- [ ] **Step 3: Re-export**

`packages/contracts/src/index.ts`:
```ts
export * from './patterns.js';
```

- [ ] **Step 4: Register in `openapi.ts`**

Phase 1 (Task 7) had to add this — same pattern. In
`packages/contracts/src/openapi.ts`:
1. Import `PatternOpenApiRegistry`.
2. Add to the default registries list / `ContractRegistries` map.

Mirror what `TechniqueOpenApiRegistry` does there.

- [ ] **Step 5: tsup + package.json entries**

```ts
// tsup.config.ts — add 'src/patterns.ts' to the entry list
```

```json
// package.json — add ./patterns entry mirroring ./techniques
"./patterns": {
  "import": "./dist/patterns.js",
  "require": "./dist/patterns.cjs",
  "types": "./dist/patterns.d.ts"
}
```

- [ ] **Step 6: Verify**

```
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
pnpm --filter @repo/contracts build
```

Expected: 173/173, typecheck clean, build emits `dist/patterns.js`.

- [ ] **Step 7: Commit**

```
git add packages/contracts/src/patterns.ts \
        packages/contracts/src/casl.ts \
        packages/contracts/src/index.ts \
        packages/contracts/src/openapi.ts \
        packages/contracts/tsup.config.ts \
        packages/contracts/package.json
git commit -m "feat(contracts): Pattern schemas + CASL subject"
```

---

## Task 5: Backend — refactor `category-guards.ts` to be `kind`-agnostic + relocate

**Files:**
- Move + edit: `apps/backend/src/modules/technique/category-guards.ts` → `apps/backend/src/modules/classification-category/category-guards.ts`
- Move + edit: `apps/backend/src/modules/technique/category-guards.spec.ts` → `apps/backend/src/modules/classification-category/category-guards.spec.ts`
- Modify: `apps/backend/src/modules/technique/technique.service.ts` (import path)
- Possibly Modify: `apps/backend/src/modules/technique/technique.module.ts`

- [ ] **Step 1: Move the file**

`git mv` both files:
```
git mv apps/backend/src/modules/technique/category-guards.ts \
       apps/backend/src/modules/classification-category/category-guards.ts
git mv apps/backend/src/modules/technique/category-guards.spec.ts \
       apps/backend/src/modules/classification-category/category-guards.spec.ts
```

- [ ] **Step 2: Refactor signature to take `kind`**

The Phase 1 signature already accepted `kind: 'technique'`. Generalize:

```ts
// apps/backend/src/modules/classification-category/category-guards.ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RootCode } from '@repo/contracts/classification-category';
import {
  TECHNIQUE_ALLOWED_ROOTS,
  TECHNIQUE_REQUIRED_ROOT,
} from '@repo/contracts/techniques';
import {
  PATTERN_ALLOWED_ROOTS,
  PATTERN_REQUIRED_ROOT,
} from '@repo/contracts/patterns';

import type { ClassificationCategoryService } from './classification-category.service.js';

export type GuardKind = 'technique' | 'pattern';

const ALLOWED: Record<GuardKind, readonly RootCode[]> = {
  technique: TECHNIQUE_ALLOWED_ROOTS,
  pattern:   PATTERN_ALLOWED_ROOTS,
};

const REQUIRED: Record<GuardKind, RootCode> = {
  technique: TECHNIQUE_REQUIRED_ROOT,
  pattern:   PATTERN_REQUIRED_ROOT,
};

export async function validateCategoryLinks(
  classifications: ClassificationCategoryService,
  args: { classificationIds: string[]; kind: GuardKind },
): Promise<void> {
  const allowed = ALLOWED[args.kind];
  const required = REQUIRED[args.kind];
  const dedup = Array.from(new Set(args.classificationIds));
  const roots = await classifications.resolveRootCodes(dedup);

  for (const id of dedup) {
    const r = roots.get(id);
    if (r === null || r === undefined) {
      throw new NotFoundException({
        error: { code: 'INVALID_CATEGORY', message: `Classification ${id} not found.`, details: { offendingId: id, reason: 'not_found' } },
      });
    }
    if (!allowed.includes(r)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_CATEGORY',
          message: `Classification ${id} has root '${r}', which is not allowed for ${args.kind}s.`,
          details: { offendingId: id, expectedRoots: allowed },
        },
      });
    }
  }
  const hasRequired = dedup.some((id) => roots.get(id) === required);
  if (!hasRequired) {
    throw new BadRequestException({
      error: {
        code: 'MISSING_REQUIRED_CATEGORY',
        message: `At least one '${required}' classification is required.`,
        details: { requiredRoot: required },
      },
    });
  }
}
```

- [ ] **Step 3: Update the spec — keep Phase 1's 8 tests + add 3 pattern cases**

Phase 1's 8 tests stay (they already pass `kind: 'technique'`). Add at the end:

```ts
describe('validateCategoryLinks (pattern)', () => {
  it('passes when ids include the required pattern_type root', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'pattern_type', b: 'hokei_subtype' }), {
        classificationIds: ['a', 'b'], kind: 'pattern',
      }),
    ).resolves.toBeUndefined();
  });

  it('BadRequest INVALID_CATEGORY when a technique root is supplied to pattern', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'pattern_type', b: 'technique_type' }), {
        classificationIds: ['a', 'b'], kind: 'pattern',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BadRequest MISSING_REQUIRED_CATEGORY when no pattern_type id supplied', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'hokei_subtype' }), {
        classificationIds: ['a'], kind: 'pattern',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 4: Update the import in technique.service.ts**

```ts
// before:
import { validateCategoryLinks } from './category-guards.js';
// after:
import { validateCategoryLinks } from '../classification-category/category-guards.js';
```

Also check whether `technique.module.ts` references the helper file (it shouldn't, since the helper is a pure function not a provider). If it does, update the path.

- [ ] **Step 5: Verify full backend suite still passes**

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

Expected: 311 + 3 new pattern guard tests = 314 passing. Typecheck clean.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/classification-category/category-guards.ts \
        apps/backend/src/modules/classification-category/category-guards.spec.ts \
        apps/backend/src/modules/technique/technique.service.ts
# also `apps/backend/src/modules/technique/category-guards.{ts,spec.ts}` are deleted by git mv
git commit -m "refactor(category-guards): relocate to classification-category module + add pattern kind"
```

---

## Task 6: Backend — `PatternModule` (repo + service + controller + ability + spec)

**Files:** All under `apps/backend/src/modules/pattern/`.

This is the workhorse task. Mirror Phase 1's `TechniqueModule` (`4f18edc`) exactly. Key deltas:

- Service injects `validateCategoryLinks` with `kind: 'pattern'`.
- Service handles the new `officialBodyOrgId` field on create + update.
- Hydrated read shape has two `classificationsByRoot` keys (`pattern_type` + `hokei_subtype`) instead of three.
- AbilityRules use subject `'Pattern'`.
- Controller's audit entity type: `'pattern'`.

- [ ] **Step 1: pattern.repository.ts**

Mirror `technique.repository.ts`. Replace all references to `technique`/`techniqueClassification` with `pattern`/`patternClassification`. Include `officialBodyOrgId` in any explicit row shape (else `$inferInsert`/`$inferSelect` picks it up).

- [ ] **Step 2: pattern.service.ts**

Mirror `technique.service.ts`. Key changes:
- `validateCategoryLinks(classifications, { classificationIds, kind: 'pattern' })`
- `auditLog.record({ entityType: 'pattern', ... })`
- CASL subject literal: `{ __caslSubjectType__: 'Pattern', createdByOrganisationId: ... }`
- Hydration groups into `{ pattern_type, hokei_subtype }` only
- Carry `officialBodyOrgId` through create + update

- [ ] **Step 3: pattern.service.spec.ts (8 tests mirroring technique)**

Cover the same matrix:
1. create rejects when actor is plain user (CASL)
2. create with empty classificationIds → MISSING_REQUIRED_CATEGORY
3. create with hokei_subtype-only ids → MISSING_REQUIRED_CATEGORY (no pattern_type)
4. create with allowed mix → 201 + audit emitted
5. update by orgadmin of another org's pattern → Forbidden
6. update replaces classifications when array is present
7. update with empty classificationIds → MISSING_REQUIRED_CATEGORY, no DB write
8. delete cascades junction but doesn't touch taxonomy

Same mock pattern as `technique.service.spec.ts`.

- [ ] **Step 4: pattern.controller.ts**

Mirror `technique.controller.ts`. Replace `'techniques'` route with `'patterns'`. Imports: `CreatePatternSchema`, `UpdatePatternSchema` from `@repo/contracts/patterns`.

- [ ] **Step 5: pattern.ability-rules.ts + spec (4 tests)**

```ts
@Injectable()
export class PatternAbilityRules implements AbilityRuleContributor {
  contributeTo(builder, user) {
    if (!user) return;
    builder.can('read', 'Pattern');
    if (user.role === 'sysadmin') {
      builder.can('manage', 'Pattern');
      return;
    }
    const orgAdminOrgs = user.memberships.filter((m) => m.role === 'orgadmin').map((m) => m.organisationId);
    if (orgAdminOrgs.length > 0) {
      builder.can('manage', 'Pattern', { createdByOrganisationId: { $in: orgAdminOrgs } });
      builder.can('create', 'Pattern');
    }
  }
}
```

4 spec cases: sysadmin manages all; orgadmin org A vs B vs global; regular user reads; anonymous can't read.

- [ ] **Step 6: pattern.module.ts**

```ts
@Module({
  imports: [ClassificationCategoryModule],
  controllers: [PatternController],
  providers: [PatternRepository, PatternService],
  exports: [PatternService],
})
export class PatternModule {}
```

- [ ] **Step 7: Verify + commit**

```
pnpm --filter backend exec vitest run src/modules/pattern
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
git add apps/backend/src/modules/pattern/
git commit -m "feat(pattern): repository + service + controller + ability + spec"
```

Expected: 8 service + 4 ability = 12 new tests; total ~326 passing.

---

## Task 7: Backend — AppModule wiring + AbilityFactory + OpenAPI regen

**Files:**
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.factory.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Modified: `packages/contracts/openapi/openapi.{yaml,json}`

Mirror Phase 1's Task 7 (`9e58e91`):

- [ ] **Step 1: AppModule.imports gets `PatternModule`**

- [ ] **Step 2: AbilityFactory constructor gets `@Optional() private readonly patternRules?: PatternAbilityRules;`** + append to contributors list spread

- [ ] **Step 3: AbilityModule.providers + exports list `PatternAbilityRules`**

- [ ] **Step 4: Run full backend suite + typecheck**

Expected: 326+ passing.

- [ ] **Step 5: Regenerate OpenAPI**

```
pnpm openapi:generate
```

Verify diff shows new paths `/api/patterns`, `/api/patterns/{id}` and new schemas `Pattern`, `CreatePatternInput`, `UpdatePatternInput`. If contracts wasn't rebuilt automatically, run `pnpm --filter @repo/contracts build` first.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/app.module.ts \
        apps/backend/src/infrastructure/ability/ \
        packages/contracts/openapi/
git commit -m "feat(backend): wire PatternModule + regen OpenAPI"
```

---

## Task 8: Frontend — `entities/pattern` API + hooks

**Files (all new):**
- `apps/frontend/src/entities/pattern/api/pattern.api.ts`
- `apps/frontend/src/entities/pattern/api/pattern.api.test.ts`
- `apps/frontend/src/entities/pattern/lib/hooks.ts`
- `apps/frontend/src/entities/pattern/index.ts`

Mirror Phase 1's `entities/technique` (`9a06319`) verbatim, swap names. Five API functions: `getPatterns`, `getPattern`, `createPattern`, `updatePattern`, `deletePattern`. Five hooks: `patternKeys`, `usePatternsQuery`, `usePatternQuery`, `useCreate/Update/DeletePatternMutation`.

- [ ] **Step 1: API client mirroring `technique.api.ts`**

Swap `Technique` → `Pattern`, `CreateTechniqueInput` → `CreatePatternInput`, `/api/techniques` → `/api/patterns`. The query-param building stays identical (classificationIds CSV, includeInactive, organisationId, strictClassificationIds).

- [ ] **Step 2: Hooks mirroring `technique` hooks** — query key prefix `'pattern'` instead of `'technique'`.

- [ ] **Step 3: 5 API tests** mirroring `technique.api.test.ts`. **Use real UUID v4 strings** in test fixtures (Zod 4 enforces variant nibble — `11111111-...` fails parse).

Minimum valid Pattern stub for tests:
```ts
const stubPattern = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  createdByOrganisationId: null,
  officialBodyOrgId: null,
  isActive: true,
  sortOrder: 0,
  minRankId: null,
  nameJa: '', nameRomaji: 'test', nameSv: '', nameEn: '', nameFi: '',
  descriptionSv: '', descriptionEn: '', descriptionFi: '',
  classificationsByRoot: { pattern_type: [], hokei_subtype: [] },
  classifications: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};
```

- [ ] **Step 4: Barrel + verify + commit**

```
pnpm --filter frontend exec vitest run src/entities/pattern
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/entities/pattern/
git commit -m "feat(entities-pattern): API + React Query hooks"
```

---

## Task 9: Frontend — `PatternFormDialog` with conditional hokei UI

**Files (all new):**
- `apps/frontend/src/features/pattern-form/ui/PatternFormDialog.tsx`
- `apps/frontend/src/features/pattern-form/ui/PatternFormDialog.test.tsx`
- `apps/frontend/src/features/pattern-form/index.ts`

Mirror Phase 1's `TechniqueFormDialog` (`d78ec1d`) closely. Key deltas:

- Only two `ClassificationMultiSelect` pickers instead of three: `pattern_type` (required) + conditional `hokei_subtype`.
- Conditional render + state-clear logic:

```tsx
const typeOpts = useClassificationCategoriesByRootQuery('pattern_type');
const subtypeOpts = useClassificationCategoriesByRootQuery('hokei_subtype');

const hokeiTypeId = React.useMemo(
  () => typeOpts.data?.find((o) => o.code === 'hokei')?.id,
  [typeOpts.data],
);
const showSubtype = Boolean(hokeiTypeId) && typeIds.includes(hokeiTypeId!);

// Clear subtype state when picker hides so we don't submit stale ids.
React.useEffect(() => {
  if (!showSubtype && subtypeIds.length > 0) setSubtypeIds([]);
}, [showSubtype]);

const classificationIds = [
  ...typeIds,
  ...(showSubtype ? subtypeIds : []),
];
```

- Add an `Input` for `officialBodyOrgId` (free-text uuid; nullable; spec §9.7 acknowledges a proper org-picker is a polish pass).
- Drop the `isKihon` checkbox — patterns don't have it.

- [ ] **Step 1: PatternFormDialog.tsx** — see structure above.

- [ ] **Step 2: PatternFormDialog.test.tsx — 4 cases**

```tsx
// Mock useClassificationCategoriesByRootQuery + useCreatePatternMutation + useUpdatePatternMutation.

it('submit disabled until pattern_type chip + non-empty romaji', () => { ... });

it('hokei_subtype picker hidden when no hokei pattern_type selected', async () => {
  renderDialog();
  // Click a non-hokei pattern_type chip (e.g. kobo).
  // Assert the subtype picker is NOT in the DOM.
});

it('hokei_subtype picker appears after clicking the hokei chip', async () => {
  renderDialog();
  // Click the hokei chip.
  // The subtype picker becomes visible.
});

it('deselecting hokei clears subtype state on submit', async () => {
  renderDialog();
  // Click hokei → subtype picker appears → click a subtype chip
  // → click hokei again to deselect → subtype picker disappears
  // → fill romaji → submit
  // Assert mutation was called with classificationIds containing pattern_type only (no subtype id).
});
```

For each test use real UUIDs and provide enough mock options so the chips render.

- [ ] **Step 3: Barrel**

```ts
// features/pattern-form/index.ts
export { PatternFormDialog, type PatternFormDialogProps } from './ui/PatternFormDialog.js';
```

- [ ] **Step 4: Verify + commit**

```
pnpm --filter frontend exec vitest run src/features/pattern-form
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/features/pattern-form/
git commit -m "feat(pattern-form): PatternFormDialog with conditional hokei_subtype picker"
```

---

## Task 10: Frontend — pages + routes + sidebar entries

**Files:**
- Create: `apps/frontend/src/pages/patterns/` (page + test + barrel)
- Create: `apps/frontend/src/pages/admin-patterns/` (page + test + barrel)
- Create: `apps/frontend/src/app/router/routes/_app.patterns.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.admin.patterns.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Auto-regen: `apps/frontend/src/app/router/routeTree.gen.ts`

Mirror Phase 1's pages exactly (`75df17b`). Key deltas:

- Filter bar: only two pickers (`pattern_type` + conditional `hokei_subtype`).
- Admin page's "New pattern" button → opens `PatternFormDialog`.
- Sidebar main NAV gets `{ to: '/patterns', icon: BookOpen, labelKey: 'nav.patterns' }`.
- Sidebar admin cluster gets `/admin/patterns` gated by `ability?.can('create', 'Pattern')`, icon `LibraryBig`.

- [ ] **Step 1: PatternsPage (read-only)** with conditional filter visibility (same `hokeiTypeId` + `typeIds.includes(hokeiTypeId)` logic).

- [ ] **Step 2: AdminPatternsPage** — mirrors `AdminTechniquesPage`.

- [ ] **Step 3: Routes** — mirror `_app.techniques.tsx` + `_app.admin.techniques.tsx`. Sysadmin-only on admin route (orgadmin gating awaits CASL frontend extension, per Phase 1 Task 11's documented fallback).

- [ ] **Step 4: Sidebar entries** — add to NAV array and to the Administration cluster. Pick icons: `BookOpen` for `/patterns`, `LibraryBig` for `/admin/patterns`.

- [ ] **Step 5: Hand-add route entries to `routeTree.gen.ts`** (it has `@ts-nocheck`).

- [ ] **Step 6: Page tests** — mirror `TechniquesPage.test.tsx` + `AdminTechniquesPage.test.tsx`. Use raw-key fallback regex (i18n keys land in Task 11). 2 tests each = 4 new.

- [ ] **Step 7: Verify + commit**

```
pnpm --filter frontend exec vitest run src/pages/patterns src/pages/admin-patterns src/widgets/appsidebar
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/pages/patterns/ apps/frontend/src/pages/admin-patterns/ \
        apps/frontend/src/app/router/routes/_app.patterns.tsx \
        apps/frontend/src/app/router/routes/_app.admin.patterns.tsx \
        apps/frontend/src/app/router/routeTree.gen.ts \
        apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(patterns): /patterns + /admin/patterns pages + sidebar entries"
```

---

## Task 11: i18n keys (en/sv/fi)

**Files:**
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

Mirror Phase 1's Task 12 (`9414339`) i18n approach. Add:

### en.json

```json
// inside "nav":
"patterns": "Patterns",
"adminPatterns": "Patterns",

// top-level (alongside "techniques"):
"patterns": {
  "title": "Patterns",
  "description": "Browse the pattern catalogue. Filter by pattern type and (for hokei) by subtype.",
  "empty": "No patterns match the selected filters.",
  "filters": {
    "all": "All",
    "patternType": "Pattern type",
    "hokeiSubtype": "Hokei subtype",
    "clear": "Clear filters"
  },
  "form": {
    "title": "Edit pattern",
    "newTitle": "New pattern",
    "nameRomaji": "Name (romaji)",
    "nameJa": "Name (ja)",
    "nameSv": "Name (sv)",
    "nameEn": "Name (en)",
    "nameFi": "Name (fi)",
    "descriptionSv": "Description (sv)",
    "descriptionEn": "Description (en)",
    "descriptionFi": "Description (fi)",
    "officialBodyOrgId": "Official body organisation (uuid)",
    "minRank": "Min rank",
    "sortOrder": "Sort order",
    "isActive": "Active"
  },
  "errors": {
    "missingRequiredCategory": "At least one Pattern type is required.",
    "invalidCategory": "Invalid category selection.",
    "requiresRomaji": "Name (romaji) is required."
  }
},

// inside "admin":
"patterns": {
  "title": "Manage patterns",
  "description": "Create, edit and remove patterns. Org admins manage their own org's entries; sysadmins manage globals.",
  "newPattern": "New pattern",
  "editPattern": "Edit pattern",
  "deleteConfirm": "Delete this pattern? This cannot be undone."
}
```

### sv.json

Same structure with Swedish:
- `patterns` → "Mönster"
- `adminPatterns` → "Mönster"
- `title` → "Mönster"
- `description` → "Bläddra i mönsterkatalogen. Filtrera på mönstertyp och (för hokei) på undertyp."
- `empty` → "Inga mönster matchar de valda filtren."
- `patternType` → "Mönstertyp"
- `hokeiSubtype` → "Hokei-undertyp"
- `clear` → "Rensa filter"
- form fields: "Namn (...)", "Beskrivning (...)", "Officiellt huvudorganisation (uuid)", "Minsta grad", "Sorteringsordning", "Aktiv"
- form titles: "Redigera mönster" / "Nytt mönster"
- errors: "Minst en mönstertyp krävs.", "Ogiltigt kategorival.", "Namn (romaji) krävs."
- admin.patterns: "Hantera mönster", "Skapa, redigera och ta bort mönster..."
- delete confirm: "Ta bort detta mönster? Detta kan inte ångras."

### fi.json

Same structure with Finnish:
- `patterns` → "Kuviot"
- `adminPatterns` → "Kuviot"
- `title` → "Kuviot"
- `description` → "Selaa kuvioluetteloa. Suodata kuviotyypin ja (hokein osalta) alatyypin mukaan."
- `empty` → "Mikään kuvio ei vastaa valittuja suodattimia."
- `patternType` → "Kuviotyyppi"
- `hokeiSubtype` → "Hokei-alatyyppi"
- `clear` → "Tyhjennä suodattimet"
- form fields: "Nimi (...)", "Kuvaus (...)", "Virallinen kattojärjestö (uuid)", "Vähimmäisarvo", "Järjestys", "Aktiivinen"
- form titles: "Muokkaa kuviota" / "Uusi kuvio"
- errors: "Vähintään yksi kuviotyyppi vaaditaan.", "Virheellinen kategoriavalinta.", "Nimi (romaji) vaaditaan."
- admin.patterns: "Hallitse kuvioita", "Luo, muokkaa ja poista kuvioita..."
- delete confirm: "Poistetaanko tämä kuvio? Tätä ei voi peruuttaa."

- [ ] **Step 1: Edit en.json — add `nav.patterns`, `nav.adminPatterns`, top-level `patterns` block, `admin.patterns` block**

- [ ] **Step 2: Edit sv.json — same structure with Swedish**

- [ ] **Step 3: Edit fi.json — same structure with Finnish**

- [ ] **Step 4: Update page tests that asserted raw key text**

If the Task 10 tests used raw-key regex (`/admin\.patterns\.newPattern/i`), now that i18n keys are seeded they'll fail. Update each to match seeded text:
- `/new pattern|nytt mönster|uusi kuvio/i`

(Phase 1 Task 12 had to do exactly this — same one-line fix per test.)

- [ ] **Step 5: Verify**

```
pnpm --filter frontend exec vitest run src/pages/patterns src/pages/admin-patterns src/features/pattern-form
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/i18n/locales/ \
        apps/frontend/src/pages/patterns/ \
        apps/frontend/src/pages/admin-patterns/
git commit -m "feat(i18n): patterns + admin.patterns keys (en/sv/fi)"
```

---

## Task 12: Full pipeline + clean tree

**Files:** None modified directly — verification only.

- [ ] **Step 1: Regenerate OpenAPI if Task 7 didn't (idempotent)**

```
pnpm openapi:generate
```

If the diff is empty: no commit. If a diff exists (anchor renumbering or similar), commit:

```
git add packages/contracts/openapi/
git commit -m "chore(contracts): regen OpenAPI after patterns module"
```

- [ ] **Step 2: Backend tests + typecheck**

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

Expected: ~326/326 tests pass, tsc exit 0.

- [ ] **Step 3: Contracts tests + typecheck + build**

```
pnpm --filter @repo/contracts exec vitest run
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts build
```

Expected: 173/173.

- [ ] **Step 4: Frontend tests + typecheck + arch + build**

```
cd apps/frontend
npx vitest run
npx tsc --noEmit
npm run arch
npx vite build
```

Expected: tests pass (mind the flaky `profile-form` + `organisation-form` from Phase 1 — re-run individually if needed); typecheck clean; arch 0 errors (warnings will bump by ~3 for new slices but no new errors); build successful.

If `excessive-slicing` re-triggers because of new feature/page slices (`pattern-form`, `pages/patterns`, `pages/admin-patterns`), it's still demoted to warn from Phase 1.

- [ ] **Step 5: Clean tree confirmation**

```
git status --short
```

Expected: empty except pre-existing dirty files (`belt-catalog.seed.json`, `NavUser.tsx`).

---

## Self-Review Notes

Spec coverage check:
- §4.1 taxonomy additions → Task 2 ✓
- §4.2 `pattern` table → Task 1 ✓
- §4.3 `pattern_classification` junction → Task 1 ✓
- §5 CASL `Pattern` → Tasks 4 + 6 ✓
- §6 REST API → Task 6 (controller) ✓
- §7 backend module shape → Task 6 ✓
- §7.1 shared category-guards refactor → Task 5 ✓
- §7.2 hokei_subtype conventional → enforced via UI in Task 9, not backend (correct per spec)
- §8 Zod contracts → Tasks 3 + 4 ✓
- §9 frontend slices → Tasks 8, 9, 10 ✓
- §9.3 conditional hokei UI → Task 9 ✓
- §10 i18n → Task 11 ✓
- §11 migrations → Tasks 1, 2 ✓
- §12 testing → covered across every Task's spec step ✓
- §13 acceptance criteria → backend specs + frontend tests cover all listed cases ✓

Placeholder scan: no TBDs. Every reference to "mirror Phase 1's X" includes the exact commit SHA and either the file name or section to mirror, so the implementer can read the source directly.

Type consistency:
- `classificationIds` (camelCase) used in payloads + URL params ✓
- `RootCode` widened in Task 3 — flagged that Phase 1 callers continue to work (TECHNIQUE_ALLOWED_ROOTS is a narrow tuple) ✓
- `kind: 'technique' | 'pattern'` consistent across guards + spec ✓
- `entityType: 'pattern'` for audit ✓ (matches table name)

Total task count: 12. Estimated commit count: 12-14 (Task 7 may produce 1 or 2 depending on OpenAPI churn; Task 12 may emit 0 or 1 depending on regen idempotency).
