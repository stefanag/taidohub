# Techniques (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a classification taxonomy + a `Technique` resource that classifies against multiple categories per dimension (type / sotai / attack), with full CRUD UI for sysadmin + orgadmin and a read-only catalogue for everyone else.

**Architecture:** New `classification_category` table holds taxonomy roots + children (1 level deep). `technique` is the core entity; `technique_classification` is the many-to-many junction. Backend uses two new Nest modules with cached root-id lookup + `validateCategoryLinks` guard. Frontend adds two entity slices, one shared multi-select primitive, one feature dialog, two pages, sidebar entries, and i18n keys.

**Tech Stack:** NestJS 11 · Drizzle ORM 0.45.2 + Postgres 15 · Zod 4.4.3 with `.meta(...)` · CASL 6 · React 19 + TanStack Router + TanStack Query · shadcn primitives.

**Spec:** `docs/superpowers/specs/2026-06-10-techniques-phase1-design.md` (commit `ac30b43`)

---

## File Map

**Created:**
- `apps/backend/drizzle/0017_*.sql` (auto-generated)
- `apps/backend/drizzle/0018_*.sql` (hand-written seed migration)
- `apps/backend/src/infrastructure/database/schema/classification-category.ts`
- `apps/backend/src/infrastructure/database/schema/technique.ts`
- `apps/backend/src/modules/classification-category/classification-category.repository.ts`
- `apps/backend/src/modules/classification-category/classification-category.service.ts`
- `apps/backend/src/modules/classification-category/classification-category.service.spec.ts`
- `apps/backend/src/modules/classification-category/classification-category.controller.ts`
- `apps/backend/src/modules/classification-category/classification-category.module.ts`
- `apps/backend/src/modules/classification-category/classification-category.ability-rules.ts`
- `apps/backend/src/modules/classification-category/classification-category.ability-rules.spec.ts`
- `apps/backend/src/modules/technique/technique.repository.ts`
- `apps/backend/src/modules/technique/category-guards.ts`
- `apps/backend/src/modules/technique/category-guards.spec.ts`
- `apps/backend/src/modules/technique/technique.service.ts`
- `apps/backend/src/modules/technique/technique.service.spec.ts`
- `apps/backend/src/modules/technique/technique.controller.ts`
- `apps/backend/src/modules/technique/technique.module.ts`
- `apps/backend/src/modules/technique/technique.ability-rules.ts`
- `apps/backend/src/modules/technique/technique.ability-rules.spec.ts`
- `packages/contracts/src/classification-category.ts`
- `packages/contracts/src/techniques.ts`
- `apps/frontend/src/entities/classification-category/api/classification-category.api.ts`
- `apps/frontend/src/entities/classification-category/api/classification-category.api.test.ts`
- `apps/frontend/src/entities/classification-category/lib/hooks.ts`
- `apps/frontend/src/entities/classification-category/index.ts`
- `apps/frontend/src/entities/technique/api/technique.api.ts`
- `apps/frontend/src/entities/technique/api/technique.api.test.ts`
- `apps/frontend/src/entities/technique/lib/hooks.ts`
- `apps/frontend/src/entities/technique/index.ts`
- `apps/frontend/src/shared/ui/classification-multi-select.tsx`
- `apps/frontend/src/shared/ui/classification-multi-select.test.tsx`
- `apps/frontend/src/features/technique-form/ui/TechniqueFormDialog.tsx`
- `apps/frontend/src/features/technique-form/ui/TechniqueFormDialog.test.tsx`
- `apps/frontend/src/features/technique-form/index.ts`
- `apps/frontend/src/pages/techniques/ui/TechniquesPage.tsx`
- `apps/frontend/src/pages/techniques/ui/TechniquesPage.test.tsx`
- `apps/frontend/src/pages/techniques/index.ts`
- `apps/frontend/src/pages/admin-techniques/ui/AdminTechniquesPage.tsx`
- `apps/frontend/src/pages/admin-techniques/ui/AdminTechniquesPage.test.tsx`
- `apps/frontend/src/pages/admin-techniques/index.ts`
- `apps/frontend/src/app/router/routes/_app.techniques.tsx`
- `apps/frontend/src/app/router/routes/_app.admin.techniques.tsx`

**Modified:**
- `packages/contracts/src/casl.ts` (`ClassificationCategory` + `Technique` subjects)
- `packages/contracts/src/index.ts` (re-export new contract modules)
- `apps/backend/src/infrastructure/database/schema/index.ts` (re-export new tables)
- `apps/backend/src/app.module.ts` (register two new modules)
- `apps/backend/src/infrastructure/ability/ability.factory.ts` (@Optional inject of new ability rules)
- `apps/backend/src/infrastructure/ability/ability.module.ts` (provide new ability rules)
- `packages/contracts/openapi/openapi.{yaml,json}` (regenerated)
- `apps/frontend/src/shared/ui/index.ts` (export `ClassificationMultiSelect`)
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` (two new entries)
- `apps/frontend/src/app/router/routeTree.gen.ts` (regenerated)
- `apps/frontend/src/i18n/locales/{en,sv,fi}.json` (new keys)

---

## Task 1: DB — schemas + migration 0017 (classification_category + technique + technique_classification)

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/classification-category.ts`
- Create: `apps/backend/src/infrastructure/database/schema/technique.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Create: `apps/backend/drizzle/0017_*.sql` (auto-generated)

- [ ] **Step 1: Schema — classification-category.ts**

```ts
import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const classificationCategory = pgTable(
  'classification_category',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    parentId: text('parent_id').references((): AnyPgColumn => classificationCategory.id, {
      onDelete: 'restrict',
    }),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    nameJa: text('name_ja').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    parentCodeUnique: uniqueIndex('classification_category_parent_code_uniq')
      .on(table.parentId, table.code)
      .nullsNotDistinct(),
  }),
);

export type DbClassificationCategory = typeof classificationCategory.$inferSelect;
export type DbNewClassificationCategory = typeof classificationCategory.$inferInsert;
```

(Use `text('id')` matching other recent tables in this codebase — verify by reading `feature-flag.ts` or `belt-ranks.ts`; if those use `uuid('id')`, switch to that style for consistency. Same applies to FK columns.)

- [ ] **Step 2: Schema — technique.ts**

```ts
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { beltRanks } from './belt-ranks.js';
import { organisations } from './organisations.js';
import { user } from './users.js';

export const technique = pgTable('technique', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  createdByOrganisationId: text('created_by_organisation_id').references(
    () => organisations.id,
    { onDelete: 'cascade' },
  ),
  createdByUserId: text('created_by_user_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  isKihon: boolean('is_kihon').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  minRankId: text('min_rank_id').references(() => beltRanks.id, { onDelete: 'set null' }),
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

import { classificationCategory } from './classification-category.js';
import { index, primaryKey } from 'drizzle-orm/pg-core';

export const techniqueClassification = pgTable(
  'technique_classification',
  {
    techniqueId: text('technique_id')
      .notNull()
      .references(() => technique.id, { onDelete: 'cascade' }),
    classificationCategoryId: text('classification_category_id')
      .notNull()
      .references(() => classificationCategory.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.techniqueId, table.classificationCategoryId] }),
    categoryIdx: index('technique_classification_category_idx').on(table.classificationCategoryId),
  }),
);

export type DbTechnique = typeof technique.$inferSelect;
export type DbNewTechnique = typeof technique.$inferInsert;
export type DbTechniqueClassification = typeof techniqueClassification.$inferSelect;
export type DbNewTechniqueClassification = typeof techniqueClassification.$inferInsert;
```

If `gen_random_uuid()` isn't available without `pgcrypto`, the seed migration will install it (see Task 2 step 1). Alternatively, app code can generate UUIDs.

- [ ] **Step 3: Re-export from `schema/index.ts`**

Append to the existing barrel:

```ts
export * from './classification-category.js';
export * from './technique.js';
```

- [ ] **Step 4: Generate migration**

```
cd apps/backend && npx drizzle-kit generate
```

Expected: `apps/backend/drizzle/0017_<adjective>_<noun>.sql` containing `CREATE TABLE` for all three tables plus the FK constraints, primary key on the junction, index, and unique-on-(parent_id, code).

- [ ] **Step 5: Hand-add the depth-CHECK trigger to migration 0017**

drizzle-kit doesn't generate triggers. Append to the generated SQL file:

```sql
--> statement-breakpoint
CREATE OR REPLACE FUNCTION classification_category_depth_check()
RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM classification_category WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'classification_category hierarchy is limited to one level: parent_id % is not a root', NEW.parent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER classification_category_depth_check_trg
  BEFORE INSERT OR UPDATE ON classification_category
  FOR EACH ROW EXECUTE FUNCTION classification_category_depth_check();
```

- [ ] **Step 6: Typecheck**

```
cd apps/backend && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Backend test suite still green**

```
pnpm --filter backend exec vitest run
```

Expected: existing 279/279 still pass (no behaviour change yet).

- [ ] **Step 8: Commit**

```
git add apps/backend/src/infrastructure/database/schema/classification-category.ts \
        apps/backend/src/infrastructure/database/schema/technique.ts \
        apps/backend/src/infrastructure/database/schema/index.ts \
        apps/backend/drizzle/0017_*.sql \
        apps/backend/drizzle/meta/
git commit -m "feat(db): classification_category + technique + junction (migration 0017)"
```

---

## Task 2: DB — seed taxonomy roots + Taido children (migration 0018)

**Files:**
- Create: `apps/backend/drizzle/0018_seed_classification_taxonomy.sql` (hand-written)
- Modify: `apps/backend/drizzle/meta/_journal.json` (drizzle-kit handles this when you run `generate`, but for an empty-schema-change generation it needs a trick — see Step 1)

- [ ] **Step 1: Force-create an empty drizzle migration slot**

Edit the journal manually OR run `npx drizzle-kit generate --custom` if available (1.x). If not, the simplest path: create the file `0018_seed_classification_taxonomy.sql` directly and append a matching entry to `meta/_journal.json` mirroring the previous entries' structure.

Verify by reading `meta/_journal.json`'s shape — typically:

```json
{
  "idx": 18,
  "version": "...",
  "when": <unixms>,
  "tag": "0018_seed_classification_taxonomy",
  "breakpoints": true
}
```

- [ ] **Step 2: Seed SQL**

```sql
-- Ensure pgcrypto for gen_random_uuid() (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Roots
INSERT INTO classification_category (id, parent_id, code, name_en, name_sv, name_fi, name_ja, sort_order, is_active)
VALUES
  (gen_random_uuid()::text, NULL, 'technique_type', 'Technique type', 'Tekniktyp',     'Tekniikkatyyppi',  '', 1, true),
  (gen_random_uuid()::text, NULL, 'sotai_category', 'Sotai category', 'Sotai-kategori', 'Sotai-kategoria',  '', 2, true),
  (gen_random_uuid()::text, NULL, 'attack_type',    'Attack type',    'Attacktyp',      'Hyökkäystyyppi',   '', 3, true);
--> statement-breakpoint

-- technique_type children
INSERT INTO classification_category (id, parent_id, code, name_en, name_sv, name_fi, name_ja, sort_order, is_active)
SELECT gen_random_uuid()::text, r.id, v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM classification_category r
CROSS JOIN (VALUES
  ('taidotechnique',   'Taido technique',   'Taidoteknik',       'Taidotekniikka',     0),
  ('generaltechnique', 'General technique', 'Allmän teknik',     'Yleinen tekniikka',  1),
  ('unsoku',           'Unsoku',            'Unsoku',            'Unsoku',             2),
  ('kamae',            'Kamae',             'Kamae',             'Kamae',              3),
  ('unshin',           'Unshin',            'Unshin',            'Unshin',             4),
  ('tachi',            'Tachi',             'Tachi',             'Tachi',              5)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r.code = 'technique_type' AND r.parent_id IS NULL;
--> statement-breakpoint

-- sotai_category children
INSERT INTO classification_category (id, parent_id, code, name_en, name_sv, name_fi, name_ja, sort_order, is_active)
SELECT gen_random_uuid()::text, r.id, v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM classification_category r
CROSS JOIN (VALUES
  ('sentai', 'Sentai', 'Sentai', 'Sentai', 0),
  ('untai',  'Untai',  'Untai',  'Untai',  1),
  ('hentai', 'Hentai', 'Hentai', 'Hentai', 2),
  ('nentai', 'Nentai', 'Nentai', 'Nentai', 3),
  ('tentai', 'Tentai', 'Tentai', 'Tentai', 4)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r.code = 'sotai_category' AND r.parent_id IS NULL;
--> statement-breakpoint

-- attack_type children
INSERT INTO classification_category (id, parent_id, code, name_en, name_sv, name_fi, name_ja, sort_order, is_active)
SELECT gen_random_uuid()::text, r.id, v.code, v.name_en, v.name_sv, v.name_fi, '', v.so, true
FROM classification_category r
CROSS JOIN (VALUES
  ('kick',          'Kick',          'Spark',          'Potku',         0),
  ('punch',         'Punch',         'Slag',           'Lyönti',        1),
  ('block',         'Block',         'Blockering',     'Torjunta',      2),
  ('takedown',      'Takedown',      'Nedtagning',     'Alasvienti',    3),
  ('off_balancing', 'Off-balancing', 'Obalansering',   'Tasapainotus',  4),
  ('grabbing',      'Grabbing',      'Grepp',          'Tarttuminen',   5),
  ('dodge',         'Dodge',         'Undanmanöver',   'Väistö',        6)
) AS v(code, name_en, name_sv, name_fi, so)
WHERE r.code = 'attack_type' AND r.parent_id IS NULL;
```

- [ ] **Step 3: Apply via the project's db:migrate script**

(The user reported the working command is `pnpm --filter backend run db:migrate`.)

```
pnpm --filter backend run db:migrate
```

Expected: 0017 + 0018 apply successfully. If 0018's journal entry is malformed, drizzle will report. Inspect & re-run.

- [ ] **Step 4: Sanity-check the seed**

Optional — connect to local DB and run `SELECT code, parent_id FROM classification_category ORDER BY parent_id NULLS FIRST, sort_order;` to confirm 3 roots + 18 children.

- [ ] **Step 5: Commit**

```
git add apps/backend/drizzle/0018_seed_classification_taxonomy.sql apps/backend/drizzle/meta/_journal.json
git commit -m "feat(db): seed classification taxonomy (3 roots + 18 children) — migration 0018"
```

---

## Task 3: Contracts — `classification-category` schemas + CASL subject

**Files:**
- Create: `packages/contracts/src/classification-category.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Contracts module**

```ts
// packages/contracts/src/classification-category.ts
import { z } from 'zod';

export const ROOT_CODES = ['technique_type', 'sotai_category', 'attack_type'] as const;
export const RootCodeSchema = z.enum(ROOT_CODES);
export type RootCode = z.infer<typeof RootCodeSchema>;

export const ClassificationCategorySchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  rootCode: RootCodeSchema.nullable(),
  code: z.string().min(1),
  nameEn: z.string(),
  nameSv: z.string(),
  nameFi: z.string(),
  nameJa: z.string(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
}).meta({
  id: 'ClassificationCategory',
  description: 'A node in the classification taxonomy (root or child).',
  example: {
    id: '11111111-1111-1111-1111-111111111111',
    parentId: '00000000-0000-0000-0000-000000000000',
    rootCode: 'attack_type',
    code: 'kick',
    nameEn: 'Kick', nameSv: 'Spark', nameFi: 'Potku', nameJa: '',
    sortOrder: 0,
    isActive: true,
  },
});

export const UpdateClassificationCategorySchema = z.object({
  nameEn: z.string().min(1).optional(),
  nameSv: z.string().min(1).optional(),
  nameFi: z.string().min(1).optional(),
  nameJa: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
}).meta({ id: 'UpdateClassificationCategoryInput' });

export type ClassificationCategory = z.infer<typeof ClassificationCategorySchema>;
export type UpdateClassificationCategoryInput = z.infer<typeof UpdateClassificationCategorySchema>;
```

- [ ] **Step 2: CASL subject**

In `packages/contracts/src/casl.ts`, find `AppSubjectName` (or wherever subjects are listed). Add `'ClassificationCategory'` before the `'all'` wildcard. Define the shape:

```ts
export type ClassificationCategorySubjectShape = {
  readonly __caslSubjectType__: 'ClassificationCategory';
};
```

(Mirror the existing `FeatureFlagSubjectShape` style for consistency.)

- [ ] **Step 3: Re-export**

Append to `packages/contracts/src/index.ts`:

```ts
export * from './classification-category.js';
```

- [ ] **Step 4: Typecheck + test**

```
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
```

Expected: clean + 173/173 tests pass.

- [ ] **Step 5: Commit**

```
git add packages/contracts/src/classification-category.ts packages/contracts/src/casl.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): ClassificationCategory schemas + CASL subject"
```

---

## Task 4: Contracts — `techniques` schemas + CASL subject

**Files:**
- Create: `packages/contracts/src/techniques.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Contracts module**

```ts
// packages/contracts/src/techniques.ts
import { z } from 'zod';

import { ClassificationCategorySchema, RootCodeSchema, type RootCode } from './classification-category.js';

export const TECHNIQUE_ALLOWED_ROOTS = ['technique_type', 'sotai_category', 'attack_type'] as const;
export const TECHNIQUE_REQUIRED_ROOT = 'technique_type' as const;

export const TechniqueSchema = z.object({
  id: z.string().uuid(),
  createdByOrganisationId: z.string().uuid().nullable(),
  isKihon: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  minRankId: z.string().uuid().nullable(),
  nameJa: z.string(),
  nameRomaji: z.string(),
  nameSv: z.string(), nameEn: z.string(), nameFi: z.string(),
  descriptionSv: z.string(), descriptionEn: z.string(), descriptionFi: z.string(),
  classificationsByRoot: z.object({
    technique_type: z.array(ClassificationCategorySchema),
    sotai_category: z.array(ClassificationCategorySchema),
    attack_type:    z.array(ClassificationCategorySchema),
  }),
  classifications: z.array(ClassificationCategorySchema.extend({ rootCode: RootCodeSchema })),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'Technique', description: 'A classified technique catalogue entry.' });

export const CreateTechniqueSchema = z.object({
  classificationIds: z.array(z.string().uuid()).min(1),
  organisationId: z.string().uuid().nullable().optional(),
  isKihon: z.boolean().default(false),
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
}).meta({ id: 'CreateTechniqueInput' });

export const UpdateTechniqueSchema = CreateTechniqueSchema.partial()
  .meta({ id: 'UpdateTechniqueInput' });

export type Technique = z.infer<typeof TechniqueSchema>;
export type CreateTechniqueInput = z.infer<typeof CreateTechniqueSchema>;
export type UpdateTechniqueInput = z.infer<typeof UpdateTechniqueSchema>;
```

- [ ] **Step 2: CASL subject**

In `packages/contracts/src/casl.ts`, add `'Technique'` to `AppSubjectName` and the shape:

```ts
export type TechniqueSubjectShape = {
  readonly __caslSubjectType__: 'Technique';
  createdByOrganisationId?: string | null;
};
```

The `createdByOrganisationId` field is used by orgadmin conditional rules.

- [ ] **Step 3: Re-export**

```ts
// packages/contracts/src/index.ts
export * from './techniques.js';
```

- [ ] **Step 4: Verify**

```
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
```

- [ ] **Step 5: Commit**

```
git add packages/contracts/src/techniques.ts packages/contracts/src/casl.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): Technique schemas + CASL subject"
```

---

## Task 5: Backend — ClassificationCategoryModule

**Files (all new):**
- `apps/backend/src/modules/classification-category/classification-category.repository.ts`
- `apps/backend/src/modules/classification-category/classification-category.service.ts`
- `apps/backend/src/modules/classification-category/classification-category.service.spec.ts`
- `apps/backend/src/modules/classification-category/classification-category.controller.ts`
- `apps/backend/src/modules/classification-category/classification-category.module.ts`
- `apps/backend/src/modules/classification-category/classification-category.ability-rules.ts`
- `apps/backend/src/modules/classification-category/classification-category.ability-rules.spec.ts`

- [ ] **Step 1: Repository**

```ts
// classification-category.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { classificationCategory } from '../../infrastructure/database/schema/classification-category.js';

export type ClassificationCategoryRow = typeof classificationCategory.$inferSelect;

@Injectable()
export class ClassificationCategoryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findRoots(): Promise<ClassificationCategoryRow[]> {
    return this.db.select().from(classificationCategory).where(isNull(classificationCategory.parentId));
  }

  async findChildren(parentId: string, includeInactive = false): Promise<ClassificationCategoryRow[]> {
    if (includeInactive) {
      return this.db.select().from(classificationCategory).where(eq(classificationCategory.parentId, parentId));
    }
    return this.db
      .select()
      .from(classificationCategory)
      .where(and(eq(classificationCategory.parentId, parentId), eq(classificationCategory.isActive, true)));
  }

  async findRootByCode(code: string): Promise<ClassificationCategoryRow | null> {
    const rows = await this.db
      .select()
      .from(classificationCategory)
      .where(and(eq(classificationCategory.code, code), isNull(classificationCategory.parentId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findManyByIds(ids: readonly string[]): Promise<ClassificationCategoryRow[]> {
    if (ids.length === 0) return [];
    const { inArray } = await import('drizzle-orm');
    return this.db.select().from(classificationCategory).where(inArray(classificationCategory.id, ids));
  }

  async update(
    id: string,
    patch: Partial<Pick<ClassificationCategoryRow, 'nameEn' | 'nameSv' | 'nameFi' | 'nameJa' | 'sortOrder' | 'isActive'>>,
    tx?: DrizzleExecutor,
  ): Promise<ClassificationCategoryRow> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(classificationCategory)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(classificationCategory.id, id))
      .returning();
    if (!row) throw new Error(`classification_category ${id} not found`);
    return row;
  }
}
```

- [ ] **Step 2: Service (with root cache + decoration)**

```ts
// classification-category.service.ts
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  type ClassificationCategory,
  type RootCode,
  ROOT_CODES,
  type UpdateClassificationCategoryInput,
} from '@repo/contracts/classification-category';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import {
  ClassificationCategoryRepository,
  type ClassificationCategoryRow,
} from './classification-category.repository.js';

@Injectable()
export class ClassificationCategoryService {
  private readonly logger = new Logger(ClassificationCategoryService.name);
  private rootCache: Map<RootCode, ClassificationCategoryRow> | null = null;

  constructor(private readonly repo: ClassificationCategoryRepository) {}

  /** Lazily builds the (rootCode -> row) cache. Root rows don't change at runtime. */
  async getRootMap(): Promise<Map<RootCode, ClassificationCategoryRow>> {
    if (this.rootCache) return this.rootCache;
    const roots = await this.repo.findRoots();
    const next = new Map<RootCode, ClassificationCategoryRow>();
    for (const r of roots) {
      if ((ROOT_CODES as readonly string[]).includes(r.code)) {
        next.set(r.code as RootCode, r);
      }
    }
    this.rootCache = next;
    return next;
  }

  async listByRoot(rootCode: RootCode, opts: { includeInactive?: boolean } = {}): Promise<ClassificationCategory[]> {
    const roots = await this.getRootMap();
    const root = roots.get(rootCode);
    if (!root) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Root '${rootCode}' not seeded.` } });
    const rows = await this.repo.findChildren(root.id, opts.includeInactive ?? false);
    return rows.map((r) => this.toApi(r, rootCode));
  }

  /** Returns id -> RootCode for every input id. Unknown ids map to null. */
  async resolveRootCodes(ids: readonly string[]): Promise<Map<string, RootCode | null>> {
    const rows = await this.repo.findManyByIds(ids);
    const roots = await this.getRootMap();
    const idToRoot = new Map<string, ClassificationCategoryRow>();
    for (const r of roots.values()) idToRoot.set(r.id, r);

    const out = new Map<string, RootCode | null>();
    for (const id of ids) out.set(id, null);
    for (const r of rows) {
      if (r.parentId === null) {
        // Linking against a root is invalid by design, but for the resolver we still report the rootCode if it's known.
        if ((ROOT_CODES as readonly string[]).includes(r.code)) out.set(r.id, r.code as RootCode);
      } else {
        const parent = idToRoot.get(r.parentId);
        if (parent && (ROOT_CODES as readonly string[]).includes(parent.code)) {
          out.set(r.id, parent.code as RootCode);
        }
      }
    }
    return out;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateClassificationCategoryInput,
  ): Promise<ClassificationCategory> {
    if (actor.role !== 'sysadmin') {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Only sysadmins may edit classification categories.' } });
    }
    const row = await this.repo.update(id, input);
    // Invalidate cache only if a root row was updated.
    if (row.parentId === null) this.rootCache = null;
    const roots = await this.getRootMap();
    const parent = row.parentId ? Array.from(roots.values()).find((r) => r.id === row.parentId) : null;
    const rootCode = parent ? (parent.code as RootCode) : ((ROOT_CODES as readonly string[]).includes(row.code) ? (row.code as RootCode) : null);
    return this.toApi(row, rootCode);
  }

  toApi(row: ClassificationCategoryRow, rootCode: RootCode | null): ClassificationCategory {
    return {
      id: row.id,
      parentId: row.parentId,
      rootCode,
      code: row.code,
      nameEn: row.nameEn, nameSv: row.nameSv, nameFi: row.nameFi, nameJa: row.nameJa,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
  }
}
```

- [ ] **Step 3: Spec (8 tests)**

```ts
// classification-category.service.spec.ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassificationCategoryService } from './classification-category.service.js';

const ROOT_TECH = { id: 'r-tech', parentId: null, code: 'technique_type', isActive: true, nameEn: 'TT', nameSv: '', nameFi: '', nameJa: '', sortOrder: 1, createdAt: new Date(), updatedAt: new Date() };
const CHILD_KICK = { id: 'c-kick', parentId: 'r-atk', code: 'kick', isActive: true, nameEn: 'Kick', nameSv: '', nameFi: '', nameJa: '', sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const ROOT_ATK = { id: 'r-atk', parentId: null, code: 'attack_type', isActive: true, nameEn: 'AT', nameSv: '', nameFi: '', nameJa: '', sortOrder: 3, createdAt: new Date(), updatedAt: new Date() };

function makeRepo(seed: { roots?: any[]; children?: Record<string, any[]>; byIds?: any[] }) {
  return {
    findRoots: vi.fn().mockResolvedValue(seed.roots ?? []),
    findChildren: vi.fn().mockImplementation(async (pid: string) => seed.children?.[pid] ?? []),
    findRootByCode: vi.fn(),
    findManyByIds: vi.fn().mockResolvedValue(seed.byIds ?? []),
    update: vi.fn().mockImplementation(async (id: string, patch: any) => ({ ...CHILD_KICK, id, ...patch })),
  };
}

function build(repo: ReturnType<typeof makeRepo>): ClassificationCategoryService {
  return new ClassificationCategoryService(repo as never);
}

describe('ClassificationCategoryService', () => {
  it('getRootMap populates from repo and caches on subsequent calls', async () => {
    const repo = makeRepo({ roots: [ROOT_TECH, ROOT_ATK] });
    const svc = build(repo);
    const m1 = await svc.getRootMap();
    const m2 = await svc.getRootMap();
    expect(m1.size).toBe(2);
    expect(m1.get('technique_type')?.id).toBe('r-tech');
    expect(repo.findRoots).toHaveBeenCalledTimes(1);
    expect(m2).toBe(m1);
  });

  it('listByRoot 404s when the root has not been seeded', async () => {
    const svc = build(makeRepo({ roots: [] }));
    await expect(svc.listByRoot('technique_type')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listByRoot returns children with rootCode populated', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH, ROOT_ATK], children: { 'r-atk': [CHILD_KICK] } }));
    const out = await svc.listByRoot('attack_type');
    expect(out).toHaveLength(1);
    expect(out[0]!.rootCode).toBe('attack_type');
    expect(out[0]!.code).toBe('kick');
  });

  it('resolveRootCodes maps known ids and reports null for unknown', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH, ROOT_ATK], byIds: [CHILD_KICK] }));
    const m = await svc.resolveRootCodes(['c-kick', 'unknown']);
    expect(m.get('c-kick')).toBe('attack_type');
    expect(m.get('unknown')).toBeNull();
  });

  it('update rejects non-sysadmin callers', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH] }));
    await expect(
      svc.update({ id: 'u', role: 'user', memberships: [] } as never, 'x', { nameEn: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update permits sysadmin and returns the new row', async () => {
    const svc = build(makeRepo({ roots: [ROOT_TECH, ROOT_ATK] }));
    const out = await svc.update({ id: 's', role: 'sysadmin', memberships: [] } as never, 'c-kick', { nameEn: 'Front kick' });
    expect(out.nameEn).toBe('Front kick');
  });

  it('update of a root row invalidates the root cache', async () => {
    const repo = makeRepo({ roots: [ROOT_TECH, ROOT_ATK] });
    const svc = build(repo);
    await svc.getRootMap();
    expect(repo.findRoots).toHaveBeenCalledTimes(1);
    // Pretend update returns a root.
    repo.update.mockResolvedValueOnce({ ...ROOT_TECH, nameEn: 'Technique kind' });
    await svc.update({ id: 's', role: 'sysadmin', memberships: [] } as never, ROOT_TECH.id, { nameEn: 'Technique kind' });
    await svc.getRootMap();
    expect(repo.findRoots).toHaveBeenCalledTimes(2);
  });

  it('update of a child row does NOT invalidate the root cache', async () => {
    const repo = makeRepo({ roots: [ROOT_TECH, ROOT_ATK] });
    const svc = build(repo);
    await svc.getRootMap();
    await svc.update({ id: 's', role: 'sysadmin', memberships: [] } as never, 'c-kick', { sortOrder: 5 });
    await svc.getRootMap();
    expect(repo.findRoots).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Controller**

```ts
// classification-category.controller.ts
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';

import {
  type ClassificationCategory,
  RootCodeSchema,
  UpdateClassificationCategorySchema,
  type UpdateClassificationCategoryInput,
} from '@repo/contracts/classification-category';

import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ClassificationCategoryService } from './classification-category.service.js';

@Controller('classification-categories')
export class ClassificationCategoryController {
  constructor(private readonly service: ClassificationCategoryService) {}

  @Get()
  list(
    @Query('root', new ZodValidationPipe(RootCodeSchema)) root: ReturnType<typeof RootCodeSchema['parse']>,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<ClassificationCategory[]> {
    return this.service.listByRoot(root, { includeInactive: includeInactive === '1' });
  }

  @Patch(':id')
  @CheckAbility('manage', 'ClassificationCategory')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateClassificationCategorySchema)) body: UpdateClassificationCategoryInput,
  ): Promise<ClassificationCategory> {
    return this.service.update(user, id, body);
  }
}
```

- [ ] **Step 5: Ability rules**

```ts
// classification-category.ability-rules.ts
import { Injectable } from '@nestjs/common';
import type { AbilityBuilder } from '@casl/ability';

import type { AbilityRuleContributor, AppAbility } from '../../infrastructure/ability/ability.types.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

@Injectable()
export class ClassificationCategoryAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'ClassificationCategory');
    if (user.role === 'sysadmin') {
      builder.can('manage', 'ClassificationCategory');
    }
  }
}
```

- [ ] **Step 6: Ability spec — 3 cases**

```ts
// classification-category.ability-rules.spec.ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import type { AppAbility } from '../../infrastructure/ability/ability.types.js';
import { ClassificationCategoryAbilityRules } from './classification-category.ability-rules.js';

function build(user: { id: string; role: 'sysadmin' | 'user'; memberships: never[] } | null): AppAbility {
  const b = new AbilityBuilder<AppAbility>(createMongoAbility);
  new ClassificationCategoryAbilityRules().contributeTo(b, user as never);
  return b.build();
}

describe('ClassificationCategoryAbilityRules', () => {
  it('grants sysadmin manage', () => {
    expect(build({ id: 's', role: 'sysadmin', memberships: [] }).can('manage', 'ClassificationCategory')).toBe(true);
  });
  it('regular user can read but not manage', () => {
    const a = build({ id: 'u', role: 'user', memberships: [] });
    expect(a.can('read', 'ClassificationCategory')).toBe(true);
    expect(a.can('manage', 'ClassificationCategory')).toBe(false);
  });
  it('anonymous cannot read', () => {
    expect(build(null).can('read', 'ClassificationCategory')).toBe(false);
  });
});
```

- [ ] **Step 7: Module**

```ts
// classification-category.module.ts
import { Module } from '@nestjs/common';
import { ClassificationCategoryController } from './classification-category.controller.js';
import { ClassificationCategoryRepository } from './classification-category.repository.js';
import { ClassificationCategoryService } from './classification-category.service.js';

@Module({
  controllers: [ClassificationCategoryController],
  providers: [ClassificationCategoryRepository, ClassificationCategoryService],
  exports: [ClassificationCategoryService],
})
export class ClassificationCategoryModule {}
```

- [ ] **Step 8: Run + verify**

```
pnpm --filter backend exec vitest run src/modules/classification-category
cd apps/backend && npx tsc --noEmit
```

Expected: 8 service tests + 3 ability tests = 11 new tests pass.

- [ ] **Step 9: Commit**

```
git add apps/backend/src/modules/classification-category/
git commit -m "feat(classification-category): module + service + spec + ability rules"
```

---

## Task 6: Backend — TechniqueModule with category-guards

**Files (all new):**
- `apps/backend/src/modules/technique/technique.repository.ts`
- `apps/backend/src/modules/technique/category-guards.ts`
- `apps/backend/src/modules/technique/category-guards.spec.ts`
- `apps/backend/src/modules/technique/technique.service.ts`
- `apps/backend/src/modules/technique/technique.service.spec.ts`
- `apps/backend/src/modules/technique/technique.controller.ts`
- `apps/backend/src/modules/technique/technique.module.ts`
- `apps/backend/src/modules/technique/technique.ability-rules.ts`
- `apps/backend/src/modules/technique/technique.ability-rules.spec.ts`

- [ ] **Step 1: category-guards.ts**

```ts
// category-guards.ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TECHNIQUE_ALLOWED_ROOTS, TECHNIQUE_REQUIRED_ROOT } from '@repo/contracts/techniques';
import type { RootCode } from '@repo/contracts/classification-category';

import type { ClassificationCategoryService } from '../classification-category/classification-category.service.js';

export async function validateCategoryLinks(
  classifications: ClassificationCategoryService,
  args: { classificationIds: string[]; kind: 'technique' },
): Promise<void> {
  const dedup = Array.from(new Set(args.classificationIds));
  const roots = await classifications.resolveRootCodes(dedup);
  for (const id of dedup) {
    const r = roots.get(id);
    if (r === null) {
      throw new NotFoundException({
        error: { code: 'INVALID_CATEGORY', message: `Classification ${id} not found.`, details: { offendingId: id, reason: 'not_found' } },
      });
    }
    if (!(TECHNIQUE_ALLOWED_ROOTS as readonly string[]).includes(r)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_CATEGORY',
          message: `Classification ${id} has root '${r}', which is not allowed for techniques.`,
          details: { offendingId: id, expectedRoots: TECHNIQUE_ALLOWED_ROOTS },
        },
      });
    }
  }
  const hasRequired = dedup.some((id) => roots.get(id) === TECHNIQUE_REQUIRED_ROOT);
  if (!hasRequired) {
    throw new BadRequestException({
      error: {
        code: 'MISSING_REQUIRED_CATEGORY',
        message: `At least one '${TECHNIQUE_REQUIRED_ROOT}' classification is required.`,
        details: { requiredRoot: TECHNIQUE_REQUIRED_ROOT },
      },
    });
  }
}
```

- [ ] **Step 2: category-guards.spec.ts (8 tests covering the validation matrix)**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { validateCategoryLinks } from './category-guards.js';

function makeSvc(map: Record<string, string | null>) {
  return { resolveRootCodes: vi.fn().mockResolvedValue(new Map(Object.entries(map))) } as never;
}

describe('validateCategoryLinks (technique)', () => {
  it('passes when ids include the required root', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', b: 'attack_type' }), {
        classificationIds: ['a', 'b'], kind: 'technique',
      }),
    ).resolves.toBeUndefined();
  });

  it('NotFound when an id has no row', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', x: null }), {
        classificationIds: ['a', 'x'], kind: 'technique',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('BadRequest INVALID_CATEGORY when a root is not allowed', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', b: 'pattern_type' as never }), {
        classificationIds: ['a', 'b'], kind: 'technique',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('BadRequest MISSING_REQUIRED_CATEGORY when no technique_type id supplied', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'sotai_category' }), {
        classificationIds: ['a'], kind: 'technique',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dedupes duplicate ids (passes when single id appears multiple times)', async () => {
    const svc = makeSvc({ a: 'technique_type' });
    await expect(
      validateCategoryLinks(svc, { classificationIds: ['a', 'a', 'a'], kind: 'technique' }),
    ).resolves.toBeUndefined();
    // resolveRootCodes called with deduped array.
    expect(svc.resolveRootCodes).toHaveBeenCalledWith(['a']);
  });

  it('passes with only required root', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type' }), { classificationIds: ['a'], kind: 'technique' }),
    ).resolves.toBeUndefined();
  });

  it('passes with multiple required-root ids', async () => {
    await expect(
      validateCategoryLinks(makeSvc({ a: 'technique_type', b: 'technique_type' }), {
        classificationIds: ['a', 'b'], kind: 'technique',
      }),
    ).resolves.toBeUndefined();
  });

  it('passes with all three allowed roots represented', async () => {
    await expect(
      validateCategoryLinks(
        makeSvc({ a: 'technique_type', b: 'sotai_category', c: 'attack_type' }),
        { classificationIds: ['a', 'b', 'c'], kind: 'technique' },
      ),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Repository + Service**

These are larger; structure them mirroring `feature-flags.service.ts` + `labels.service.ts` patterns. Key methods:

- `TechniqueRepository`:
  - `findById(id)` — single row + LEFT JOIN to load classifications (hydration helper)
  - `list({ classificationIds, includeInactive, organisationId, strict })` — runs the per-root EXISTS query
  - `insertWithLinks(tx, newRow, links: { classificationCategoryId; sortOrder }[])`
  - `replaceLinks(tx, techniqueId, newIds)` — delete-not-in + insert-not-existing (or simpler: delete-all + re-insert; performance is fine at expected volumes)
  - `update(tx, id, patch)`
  - `delete(tx, id)`

- `TechniqueService`:
  - `list(actor, query)` — apply CASL filter
  - `findOne(actor, id)` — hydrate + CASL check
  - `create(actor, input)` — validateCategoryLinks → insert in tx → audit log
  - `update(actor, id, input)` — fetch existing → CASL check → if classificationIds present, replace-set in tx then re-validate against final state → audit log
  - `delete(actor, id)` — CASL check → delete in tx → audit log

For audit logging, every mutation calls `auditLog.record({ tx, entityType: 'technique', entityId: id, action, userId: actor.id, impersonatedById: actor.impersonatedBy ?? null, before, after })`.

Write the spec (`technique.service.spec.ts`) with at least these 8 cases:
1. create rejects when actor is plain user (CASL)
2. create with empty classificationIds → MISSING_REQUIRED_CATEGORY
3. create with sotai-only ids → MISSING_REQUIRED_CATEGORY
4. create with allowed mix → 201 + audit row emitted
5. update by orgadmin of another org's technique → Forbidden
6. update replaces classifications when array is present
7. update with empty classificationIds → MISSING_REQUIRED_CATEGORY, no DB write
8. delete cascades junction but doesn't touch taxonomy

- [ ] **Step 4: Controller**

```ts
// technique.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';

import {
  CreateTechniqueSchema,
  type CreateTechniqueInput,
  type Technique,
  UpdateTechniqueSchema,
  type UpdateTechniqueInput,
} from '@repo/contracts/techniques';

import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { TechniqueService } from './technique.service.js';

@Controller('techniques')
export class TechniqueController {
  constructor(private readonly service: TechniqueService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classificationIds') classificationIds?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('organisationId') organisationId?: string,
    @Query('strictClassificationIds') strict?: string,
  ): Promise<Technique[]> {
    return this.service.list(user, {
      classificationIds: classificationIds ? classificationIds.split(',').filter(Boolean) : [],
      includeInactive: includeInactive === '1',
      organisationId: organisationId ?? null,
      strict: strict === '1',
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Technique> {
    return this.service.findOne(user, id);
  }

  @Post()
  @CheckAbility('create', 'Technique')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTechniqueSchema)) body: CreateTechniqueInput,
  ): Promise<Technique> {
    return this.service.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTechniqueSchema)) body: UpdateTechniqueInput,
  ): Promise<Technique> {
    return this.service.update(user, id, body);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.service.delete(user, id);
  }
}
```

- [ ] **Step 5: Ability rules + spec**

```ts
// technique.ability-rules.ts
import { Injectable } from '@nestjs/common';
import type { AbilityBuilder } from '@casl/ability';
import type { AbilityRuleContributor, AppAbility } from '../../infrastructure/ability/ability.types.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

@Injectable()
export class TechniqueAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'Technique');
    if (user.role === 'sysadmin') {
      builder.can('manage', 'Technique');
      return;
    }
    const orgAdminOrgs = user.memberships.filter((m) => m.role === 'orgadmin').map((m) => m.organisationId);
    if (orgAdminOrgs.length > 0) {
      builder.can('manage', 'Technique', { createdByOrganisationId: { $in: orgAdminOrgs } });
      builder.can('create', 'Technique');
    }
  }
}
```

Spec (4 cases): sysadmin manages everything; orgadmin in org A manages A but not B and not global; regular user reads only; anonymous can't read.

- [ ] **Step 6: Module**

```ts
// technique.module.ts
import { Module } from '@nestjs/common';
import { ClassificationCategoryModule } from '../classification-category/classification-category.module.js';
import { TechniqueController } from './technique.controller.js';
import { TechniqueRepository } from './technique.repository.js';
import { TechniqueService } from './technique.service.js';

@Module({
  imports: [ClassificationCategoryModule],
  controllers: [TechniqueController],
  providers: [TechniqueRepository, TechniqueService],
  exports: [TechniqueService],
})
export class TechniqueModule {}
```

- [ ] **Step 7: Verify + commit**

```
pnpm --filter backend exec vitest run src/modules/technique
cd apps/backend && npx tsc --noEmit
git add apps/backend/src/modules/technique/
git commit -m "feat(technique): repository + service + category-guards + controller + spec"
```

Expected: 8 guard tests + 8 service tests + 4 ability tests = 20+ new tests.

---

## Task 7: Backend — AppModule wiring + AbilityFactory + OpenAPI regen

**Files:**
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.factory.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Modify: `packages/contracts/openapi/openapi.{yaml,json}` (regenerated)

- [ ] **Step 1: AppModule imports**

Add to the imports array:
```ts
import { ClassificationCategoryModule } from './modules/classification-category/classification-category.module.js';
import { TechniqueModule } from './modules/technique/technique.module.js';
// ...
imports: [..., ClassificationCategoryModule, TechniqueModule],
```

- [ ] **Step 2: AbilityFactory + AbilityModule**

Mirror the pattern used for `FeatureFlagsAbilityRules` (see commit `d3219f7`'s changes):
- AbilityFactory: `@Optional() private readonly classificationCategoryRules?: ClassificationCategoryAbilityRules` + `@Optional() ... techniqueRules?` + append both to contributors when present.
- AbilityModule: register both classes as providers.

- [ ] **Step 3: Run full backend suite**

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

Expected: 279 existing + 20-25 new = ~300/300+ passing.

- [ ] **Step 4: Regenerate OpenAPI**

```
pnpm openapi:generate
```

Verify the diff shows new schemas (ClassificationCategory, Technique, CreateTechniqueInput, UpdateTechniqueInput, UpdateClassificationCategoryInput) and the new paths (/api/classification-categories, /api/techniques).

- [ ] **Step 5: Commit**

```
git add apps/backend/src/app.module.ts apps/backend/src/infrastructure/ability/ packages/contracts/openapi/
git commit -m "feat(backend): wire Technique + ClassificationCategory modules + regen OpenAPI"
```

---

## Task 8: Frontend — entities/classification-category

**Files:**
- Create: `apps/frontend/src/entities/classification-category/api/classification-category.api.ts`
- Create: `apps/frontend/src/entities/classification-category/api/classification-category.api.test.ts`
- Create: `apps/frontend/src/entities/classification-category/lib/hooks.ts`
- Create: `apps/frontend/src/entities/classification-category/index.ts`

- [ ] **Step 1: API client**

```ts
// classification-category.api.ts
import { z } from 'zod';
import { ClassificationCategorySchema, type ClassificationCategory, type RootCode } from '@repo/contracts/classification-category';
import { httpClient } from '@/shared/api';

const ListSchema = z.array(ClassificationCategorySchema);

export async function getClassificationCategories(
  root: RootCode,
  opts: { includeInactive?: boolean } = {},
): Promise<ClassificationCategory[]> {
  const qs = new URLSearchParams({ root });
  if (opts.includeInactive) qs.set('includeInactive', '1');
  const raw = await httpClient(`/api/classification-categories?${qs.toString()}`);
  return ListSchema.parse(raw);
}

export async function updateClassificationCategory(
  id: string,
  patch: { nameEn?: string; nameSv?: string; nameFi?: string; nameJa?: string; sortOrder?: number; isActive?: boolean },
): Promise<ClassificationCategory> {
  const raw = await httpClient(`/api/classification-categories/${id}`, { method: 'PATCH', body: patch });
  return ClassificationCategorySchema.parse(raw);
}
```

- [ ] **Step 2: Hooks**

```ts
// lib/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootCode } from '@repo/contracts/classification-category';
import * as api from '../api/classification-category.api.js';

export const classificationCategoryKeys = {
  byRoot: (root: RootCode, includeInactive: boolean) =>
    ['classification-category', 'root', root, includeInactive] as const,
};

export function useClassificationCategoriesByRootQuery(root: RootCode, opts: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: classificationCategoryKeys.byRoot(root, opts.includeInactive ?? false),
    queryFn: () => api.getClassificationCategories(root, opts),
  });
}

export function useUpdateClassificationCategoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateClassificationCategory>[1] }) =>
      api.updateClassificationCategory(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classification-category'] });
    },
  });
}
```

- [ ] **Step 3: API tests (3 cases — list, list with includeInactive, update)**

Mirror `apps/frontend/src/entities/feature-flag/api/feature-flag.api.test.ts` style with `vi.mock('@/shared/api')`.

- [ ] **Step 4: Barrel**

```ts
// index.ts
export * from './api/classification-category.api.js';
export * from './lib/hooks.js';
```

- [ ] **Step 5: Verify + commit**

```
pnpm --filter frontend exec vitest run src/entities/classification-category
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/entities/classification-category/
git commit -m "feat(entities-classification-category): API + hooks"
```

---

## Task 9: Frontend — entities/technique

**Files:**
- Create: `apps/frontend/src/entities/technique/api/technique.api.ts`
- Create: `apps/frontend/src/entities/technique/api/technique.api.test.ts`
- Create: `apps/frontend/src/entities/technique/lib/hooks.ts`
- Create: `apps/frontend/src/entities/technique/index.ts`

- [ ] **Step 1: API client**

```ts
// technique.api.ts
import { z } from 'zod';
import { TechniqueSchema, type Technique, type CreateTechniqueInput, type UpdateTechniqueInput } from '@repo/contracts/techniques';
import { httpClient } from '@/shared/api';

const ListSchema = z.array(TechniqueSchema);

export async function getTechniques(opts: {
  classificationIds?: string[];
  includeInactive?: boolean;
  organisationId?: string | null;
  strict?: boolean;
} = {}): Promise<Technique[]> {
  const qs = new URLSearchParams();
  if (opts.classificationIds?.length) qs.set('classificationIds', opts.classificationIds.join(','));
  if (opts.includeInactive) qs.set('includeInactive', '1');
  if (opts.organisationId) qs.set('organisationId', opts.organisationId);
  if (opts.strict) qs.set('strictClassificationIds', '1');
  const raw = await httpClient(`/api/techniques${qs.toString() ? `?${qs.toString()}` : ''}`);
  return ListSchema.parse(raw);
}

export async function getTechnique(id: string): Promise<Technique> {
  const raw = await httpClient(`/api/techniques/${id}`);
  return TechniqueSchema.parse(raw);
}

export async function createTechnique(input: CreateTechniqueInput): Promise<Technique> {
  const raw = await httpClient('/api/techniques', { method: 'POST', body: input });
  return TechniqueSchema.parse(raw);
}

export async function updateTechnique(id: string, input: UpdateTechniqueInput): Promise<Technique> {
  const raw = await httpClient(`/api/techniques/${id}`, { method: 'PATCH', body: input });
  return TechniqueSchema.parse(raw);
}

export async function deleteTechnique(id: string): Promise<void> {
  await httpClient(`/api/techniques/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Hooks**

```ts
// lib/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/technique.api.js';

export const techniqueKeys = {
  list: (filterIds: string[]) => ['technique', 'list', filterIds.slice().sort().join(',')] as const,
  byId: (id: string) => ['technique', 'byId', id] as const,
};

export function useTechniquesQuery(filterIds: string[] = []) {
  return useQuery({ queryKey: techniqueKeys.list(filterIds), queryFn: () => api.getTechniques({ classificationIds: filterIds }) });
}

export function useTechniqueQuery(id: string | null) {
  return useQuery({ queryKey: techniqueKeys.byId(id ?? ''), queryFn: () => api.getTechnique(id!), enabled: !!id });
}

export function useCreateTechniqueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createTechnique,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['technique'] }),
  });
}

export function useUpdateTechniqueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.updateTechnique>[1] }) =>
      api.updateTechnique(id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['technique'] }),
  });
}

export function useDeleteTechniqueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTechnique,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['technique'] }),
  });
}
```

- [ ] **Step 3: API tests (5 cases — list, list with filter, get by id, create, update, delete)**

Mirror existing entity test patterns.

- [ ] **Step 4: Barrel + verify + commit**

```ts
// index.ts
export * from './api/technique.api.js';
export * from './lib/hooks.js';
```

```
pnpm --filter frontend exec vitest run src/entities/technique
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/entities/technique/
git commit -m "feat(entities-technique): API + React Query hooks"
```

---

## Task 10: Frontend — ClassificationMultiSelect + TechniqueFormDialog

**Files:**
- Create: `apps/frontend/src/shared/ui/classification-multi-select.tsx`
- Create: `apps/frontend/src/shared/ui/classification-multi-select.test.tsx`
- Modify: `apps/frontend/src/shared/ui/index.ts`
- Create: `apps/frontend/src/features/technique-form/ui/TechniqueFormDialog.tsx`
- Create: `apps/frontend/src/features/technique-form/ui/TechniqueFormDialog.test.tsx`
- Create: `apps/frontend/src/features/technique-form/index.ts`

- [ ] **Step 1: ClassificationMultiSelect**

```tsx
// classification-multi-select.tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useClassificationCategoriesByRootQuery } from '@/entities/classification-category';
import type { RootCode } from '@repo/contracts/classification-category';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

export interface ClassificationMultiSelectProps {
  rootCode: RootCode;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
}

export function ClassificationMultiSelect({
  rootCode, selectedIds, onChange, label, required = false, disabled = false,
}: ClassificationMultiSelectProps): React.ReactElement {
  const { i18n } = useTranslation();
  const { data: options = [], isPending } = useClassificationCategoriesByRootQuery(rootCode);
  const lang = (i18n.resolvedLanguage ?? 'en') as 'en' | 'sv' | 'fi';
  const nameKey = ({ en: 'nameEn', sv: 'nameSv', fi: 'nameFi' } as const)[lang];

  // Inactive options stay visible only if they're already selected (preserves edit-of-historical-rows UX).
  const visible = options.filter((o) => o.isActive || selectedIds.includes(o.id));

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-on-surface-variant">
        {label}{required ? ' *' : ''}
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {isPending ? <span className="text-sm text-muted-foreground">…</span> : null}
        {visible.map((o) => {
          const active = selectedIds.includes(o.id);
          return (
            <Button
              key={o.id}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              onClick={() => onChange(active ? selectedIds.filter((i) => i !== o.id) : [...selectedIds, o.id])}
              aria-pressed={active}
              disabled={disabled}
              className={cn(!o.isActive && 'opacity-60')}
            >
              {o[nameKey] || o.code}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ClassificationMultiSelect test (3 cases)**

- Renders chips from the hook (mock `useClassificationCategoriesByRootQuery`).
- Click toggles selection (calls onChange with the right id list).
- Inactive options stay visible iff selected.

- [ ] **Step 3: Export from shared/ui/index.ts**

```ts
export { ClassificationMultiSelect, type ClassificationMultiSelectProps } from './classification-multi-select.js';
```

- [ ] **Step 4: TechniqueFormDialog**

Mirror `RankHistoryFormDialog` shape: a `<Dialog>` with a form, header, body fields, footer with Cancel + Save. Three `<ClassificationMultiSelect>` instances (type, sotai, attack) plus localised name + description fields and the `isKihon` checkbox + `minRankId` picker (read existing belt-rank entity query).

State:
```tsx
const [typeIds, setTypeIds] = useState<string[]>(initialBy('technique_type'));
const [sotaiIds, setSotaiIds] = useState<string[]>(initialBy('sotai_category'));
const [attackIds, setAttackIds] = useState<string[]>(initialBy('attack_type'));

const classificationIds = [...typeIds, ...sotaiIds, ...attackIds];
const canSubmit = typeIds.length > 0 && nameRomaji.trim().length > 0;
```

- [ ] **Step 5: TechniqueFormDialog test (2 cases)**

- Submit disabled when `technique_type` is empty.
- Submitting calls the create hook with flattened `classificationIds`.

- [ ] **Step 6: Verify + commit**

```
pnpm --filter frontend exec vitest run src/shared/ui/classification-multi-select src/features/technique-form
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/shared/ui/classification-multi-select.tsx \
        apps/frontend/src/shared/ui/classification-multi-select.test.tsx \
        apps/frontend/src/shared/ui/index.ts \
        apps/frontend/src/features/technique-form/
git commit -m "feat(technique-form): ClassificationMultiSelect primitive + TechniqueFormDialog"
```

---

## Task 11: Frontend — pages + routes + sidebar entries

**Files:**
- Create: `apps/frontend/src/pages/techniques/` (page + test + barrel)
- Create: `apps/frontend/src/pages/admin-techniques/` (page + test + barrel)
- Create: `apps/frontend/src/app/router/routes/_app.techniques.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.admin.techniques.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- (Auto-regen): `apps/frontend/src/app/router/routeTree.gen.ts`

- [ ] **Step 1: TechniquesPage (read-only)**

Filter bar = three `<ClassificationMultiSelect>` rows (`techniqueType`, `sotaiCategory`, `attackType`). URL state via `useSearch` from TanStack Router — `?cats=<csv>`. The selected ids feed `useTechniquesQuery(filterIds)`.

List rendering: each row shows `nameRomaji` (or localised name fallback) + badges per `classificationsByRoot.technique_type`/`sotai_category`/`attack_type` using the row's localised name fields.

Page chrome: H1, description, the filter bar, the list, an empty state.

- [ ] **Step 2: AdminTechniquesPage**

Same filter bar + list. Plus:
- "New technique" button → opens `TechniqueFormDialog` in create mode
- Row actions: Edit (opens dialog in edit mode), Delete (with confirm)
- Row click on title also opens edit dialog (mirrors the UsersTable pattern)

- [ ] **Step 3: Routes**

`_app.techniques.tsx`:
```ts
import { createRoute } from '@tanstack/react-router';
import { TechniquesPage } from '@/pages/techniques';
import { appLayoutRoute } from './_app.js';

export const techniquesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/techniques',
  component: TechniquesPage,
});
export const Route = techniquesRoute;
```

`_app.admin.techniques.tsx` mirrors `_app.admin.feature-flags.tsx` — `beforeLoad` checks `role === 'sysadmin'` OR an `orgadmin` membership exists, else redirect to `/dashboard`.

- [ ] **Step 4: Sidebar entries**

In `AppSidebar.tsx`:
- Main NAV: add `{ to: '/techniques', icon: Swords, labelKey: 'nav.techniques' }`.
- Administration cluster: add a SidebarMenuItem for `/admin/techniques` gated by `ability?.can('manage', 'Technique')`.

- [ ] **Step 5: Page tests (3 cases each — render, filter changes URL, row-click opens dialog)**

- [ ] **Step 6: Verify + commit**

```
pnpm --filter frontend exec vitest run src/pages/techniques src/pages/admin-techniques src/widgets/appsidebar
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/pages/techniques/ apps/frontend/src/pages/admin-techniques/ \
        apps/frontend/src/app/router/routes/_app.techniques.tsx \
        apps/frontend/src/app/router/routes/_app.admin.techniques.tsx \
        apps/frontend/src/app/router/routeTree.gen.ts \
        apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(techniques): /techniques + /admin/techniques pages + sidebar entries"
```

---

## Task 12: i18n + full pipeline + clean tree

**Files:**
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`
- Verify-only: backend tests, contracts tests, frontend tests, typecheck, arch, build

- [ ] **Step 1: Add i18n keys to en.json**

```json
{
  "nav": {
    "techniques": "Techniques",
    "adminTechniques": "Techniques"
  },
  "techniques": {
    "title": "Techniques",
    "description": "Browse the technique catalogue. Filter by type, sotai, or attack type.",
    "empty": "No techniques match the selected filters.",
    "filters": {
      "all": "All",
      "techniqueType": "Technique type",
      "sotaiCategory": "Sotai",
      "attackType": "Attack type",
      "clear": "Clear filters"
    },
    "form": {
      "title": "Edit technique",
      "newTitle": "New technique",
      "nameRomaji": "Name (romaji)",
      "nameJa": "Name (ja)",
      "nameSv": "Name (sv)",
      "nameEn": "Name (en)",
      "nameFi": "Name (fi)",
      "descriptionSv": "Description (sv)",
      "descriptionEn": "Description (en)",
      "descriptionFi": "Description (fi)",
      "isKihon": "Kihon",
      "minRank": "Min rank",
      "sortOrder": "Sort order",
      "isActive": "Active"
    },
    "errors": {
      "missingRequiredCategory": "At least one Technique type is required.",
      "invalidCategory": "Invalid category selection.",
      "requiresRomaji": "Name (romaji) is required."
    }
  },
  "admin": {
    "techniques": {
      "title": "Manage techniques",
      "description": "Create, edit and remove techniques. Org admins can manage their own org's entries; sysadmins manage globals.",
      "newTechnique": "New technique",
      "editTechnique": "Edit technique",
      "deleteConfirm": "Delete this technique? This cannot be undone."
    }
  }
}
```

- [ ] **Step 2: sv.json + fi.json — Swedish + Finnish translations**

Mirror the same structure with translations. Recruit `recallable` Swedish + Finnish for martial-arts terms where possible (e.g. `sotaiCategory: 'Sotai'` stays as-is; `techniqueType: 'Tekniktyp' / 'Tekniikkatyyppi'`).

- [ ] **Step 3: Full backend tests + typecheck**

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

- [ ] **Step 4: Contracts tests + typecheck**

```
pnpm --filter @repo/contracts exec vitest run
cd packages/contracts && npx tsc --noEmit
```

- [ ] **Step 5: Frontend full pipeline**

```
cd apps/frontend
npx vitest run
npx tsc --noEmit
npm run arch
npx vite build
```

Expected: tests green, typecheck clean, arch 0 errors (warnings may bump by 2-3 for the new entity/feature slices — that's the baseline `insignificant-slice` pattern; document but don't block).

- [ ] **Step 6: Clean tree confirmation**

```
git status --short
```

Expected: empty except the pre-existing `belt-catalog.seed.json`.

- [ ] **Step 7: Commit (if i18n still uncommitted)**

```
git add apps/frontend/src/i18n/locales/
git commit -m "feat(i18n): techniques + admin.techniques keys (en/sv/fi)"
```

---

## Self-Review Notes

Spec coverage check:
- §4.1 classification_category schema → Task 1 ✓
- §4.2 technique schema → Task 1 ✓
- §4.3 junction → Task 1 ✓
- §5 seeded taxonomy → Task 2 ✓
- §6 CASL → Tasks 3, 4, 5 (rules), 6 (rules) ✓
- §7 module shape → Tasks 5, 6 ✓
- §7.1 root cache → Task 5 ✓
- §7.2 validateCategoryLinks → Task 6 ✓
- §8 REST API → Tasks 5 (controller), 6 (controller) ✓
- §9 Zod contracts → Tasks 3, 4 ✓
- §10 frontend slices + primitive + form → Tasks 8, 9, 10 ✓
- §11 i18n → Task 12 ✓
- §12 migrations → Tasks 1, 2 ✓
- §13 testing — covered across every Task's spec step ✓
- §14 acceptance criteria — see backend specs + frontend tests ✓

Placeholder scan: no TBDs. Where the implementer must follow an existing pattern (matching feature-flags or labels), the plan names the reference commit / file. No "similar to Task N" without showing the code.

Type consistency:
- `classificationIds` (camelCase) used in payloads + URL params ✓
- `classificationCategoryId` in junction table + spec ✓
- `RootCode` union from contracts is consistent across backend + frontend ✓
- `TECHNIQUE_ALLOWED_ROOTS` / `TECHNIQUE_REQUIRED_ROOT` constants live in contracts and are reused on both sides ✓

Total task count: 12. Estimated commit count: 12-14 (Task 7 may produce 1 or 2 commits depending on OpenAPI churn).
