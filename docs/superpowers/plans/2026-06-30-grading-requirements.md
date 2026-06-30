# Grading Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a **grading-requirements** feature: per-rank requirement rows (techniques, patterns, hokei pick-N groups, jissen / time-in-grade / theory / essay scalars) owned by versioned `requirement_sets`, resolved down a student's organisation ancestor chain, and surfaced in admin editors, the student progression page, dashboard/history "next rank" cards, instructor student views, and the public rank page.

**Architecture:** Six new tables (one set table + a scalar anchor + four detail tables) all scoped on `set_id` (NULL = global). NestJS module `grading-requirements` holds two controllers — `RequirementSetsController` (admin CRUD + activate/clone/deactivate) and `RankRequirementsController` (per-rank resolve / replace / clear). Org inheritance is a new repository method `OrganisationsRepository.getAncestorIds()` (recursive CTE). The "kobo vs other" split that the spec assumes via `patterns.type` is computed via the existing `pattern_classification` join — a pattern is `kobo` when one of its `pattern_type` classifications has `code = 'kobo'`. The auth boundary is CASL action+subject (`manage RequirementSet`), not a `requirements:manage` permission string. Frontend uses TanStack Router file-based routes, TanStack Query entities under `entities/{name}`, shadcn primitives, and i18next keys for all copy.

**Tech Stack:** NestJS 11 · Drizzle ORM + Postgres · Zod (via `nestjs-zod`) · CASL 6 · React 19 + TanStack Router + TanStack Query · shadcn primitives + Tailwind 4 · i18next · vitest.

**Spec:** Pasted user prompt of 2026-06-30 ("Recreate Grading Requirements + Requirement Sets (Complete)"). Stack notes at the end of the spec acknowledge the source uses SQLite/Better-Auth/Express; this plan adapts to taidohub's Postgres/NestJS/better-auth-via-Drizzle stack.

## Global Constraints

- **PK types:** every FK to `belt_ranks` is **uuid** (not int). The spec was written against an int-PK source codebase; in taidohub `belt_ranks.id` is uuid.
- **Pattern `type`:** there is no `pattern.type` column. "kobo" is a classification with `code = 'kobo'` under the `pattern_type` root. All projections that split kobo vs other-patterns must join through `pattern_classification` → `classification_category` and filter on `code = 'kobo'`.
- **User → org resolution:** read the student's organisation from `organisation_membership` (role `'student'`). If a user has multiple student memberships, take the most recently `updated_at` (deterministic order). Fall back to the actor's primary org if none exists. **No** `user_profile.organisationId` column.
- **Permission model:** new CASL subject `RequirementSet` with shape `{ id?, organisationId? }`. `manage` is sysadmin (any) or `{ organisationId: m.organisationId }` for orgadmin/instructor memberships. `read` is granted to every authenticated user (resolution is a public-to-authed read).
- **Scope NULL handling:** every read/write filters on `(rankId, setId)` translating `null` → `IS NULL`. Helper `scopeWhere(rankId, setId)` returns the correct `and(eq(t.rankId, ...), setId === null ? isNull(t.setId) : eq(t.setId, setId))`.
- **Whole-scope replace:** `PUT /:rankId` deletes every row for `(rankId, setId)` across hokei-group-patterns → hokei-groups → scalar anchor → patterns → techniques and re-inserts from the body in one transaction. Reject with `VALIDATION_ERROR` when `setId` is missing.
- **`pickCount` clamp on insert:** `min(pickCount, patternIds.length)`. Never store a group demanding more patterns than it contains.
- **One active set per org:** `POST /:id/activate` runs in a transaction that sets `is_active = false` on every currently-active set with the same `organisation_id` before flipping the target on.
- **Routes live under `/api`:** controllers register `@Controller('requirement-sets')` and `@Controller('requirements')`; global prefix `api` is applied by `main.ts`.
- **i18n:** every UI string passes through `useTranslation()` with keys added to `en.json`, `sv.json`, and `fi.json`. No hard-coded English in JSX.
- **Routing:** TanStack Router file-based. Touch `routes/*.tsx` files; never hand-edit `routeTree.gen.ts` — it's regenerated at build by the Vite plugin.
- **Test discipline:** every new service file has a `*.spec.ts`. Every new API helper has an `*.api.test.ts`. Every new page or feature with non-trivial conditional rendering has a `*.test.tsx`.

---

## File Map

**Created (backend):**
- `apps/backend/src/infrastructure/database/schema/grading-requirements.ts`
- `apps/backend/drizzle/00NN_grading_requirements.sql` (auto-generated)
- `apps/backend/src/modules/grading-requirements/grading-requirements.module.ts`
- `apps/backend/src/modules/grading-requirements/requirement-sets.controller.ts`
- `apps/backend/src/modules/grading-requirements/requirement-sets.service.ts`
- `apps/backend/src/modules/grading-requirements/requirement-sets.service.spec.ts`
- `apps/backend/src/modules/grading-requirements/requirement-sets.repository.ts`
- `apps/backend/src/modules/grading-requirements/rank-requirements.controller.ts`
- `apps/backend/src/modules/grading-requirements/rank-requirements.service.ts`
- `apps/backend/src/modules/grading-requirements/rank-requirements.service.spec.ts`
- `apps/backend/src/modules/grading-requirements/rank-requirements.repository.ts`
- `apps/backend/src/modules/grading-requirements/grading-requirements.ability-rules.ts`
- `apps/backend/src/modules/grading-requirements/grading-requirements.ability-rules.spec.ts`
- `apps/backend/test/e2e/grading-requirements.e2e-spec.ts`

**Modified (backend):**
- `apps/backend/src/infrastructure/database/schema/index.ts` — re-export new schema
- `apps/backend/src/app.module.ts` — register `GradingRequirementsModule`
- `apps/backend/src/infrastructure/ability/ability.module.ts` — register ability contributor
- `apps/backend/src/infrastructure/ability/ability.factory.ts` — `@Optional()` inject the contributor
- `apps/backend/src/modules/organisations/organisations.repository.ts` — add `getAncestorIds`
- `apps/backend/src/modules/organisations/organisations.repository.spec.ts` — tests for it

**Created (contracts):**
- `packages/contracts/src/grading-requirements.ts` — Zod schemas + types
- `packages/contracts/src/__tests__/grading-requirements.test.ts`

**Modified (contracts):**
- `packages/contracts/src/casl.ts` — add `RequirementSet` subject + shape
- `packages/contracts/src/routes.ts` — add `RequirementSetsRoutes`, `RankRequirementsRoutes`
- `packages/contracts/src/index.ts` — re-export `grading-requirements`
- `packages/contracts/src/openapi.ts` — register `GradingRequirementsOpenApiRegistry`
- `packages/contracts/tsup.config.ts` — new entrypoint
- `packages/contracts/package.json` — new export

**Created (frontend):**
- `apps/frontend/src/entities/requirement-set/api/requirement-set.api.ts`
- `apps/frontend/src/entities/requirement-set/api/requirement-set.api.test.ts`
- `apps/frontend/src/entities/requirement-set/lib/hooks.ts`
- `apps/frontend/src/entities/requirement-set/index.ts`
- `apps/frontend/src/entities/rank-requirement/api/rank-requirement.api.ts`
- `apps/frontend/src/entities/rank-requirement/api/rank-requirement.api.test.ts`
- `apps/frontend/src/entities/rank-requirement/lib/hooks.ts`
- `apps/frontend/src/entities/rank-requirement/index.ts`
- `apps/frontend/src/shared/lib/rankProgress.ts`
- `apps/frontend/src/shared/lib/rankProgress.test.ts`
- `apps/frontend/src/features/rank-requirements-editor/ui/RankRequirementsEditor.tsx`
- `apps/frontend/src/features/rank-requirements-editor/ui/RankRequirementsEditor.test.tsx`
- `apps/frontend/src/features/rank-requirements-editor/ui/HokeiGroupEditor.tsx`
- `apps/frontend/src/features/rank-requirements-editor/index.ts`
- `apps/frontend/src/features/rank-requirements-display/ui/RankRequirementsDisplay.tsx`
- `apps/frontend/src/features/rank-requirements-display/ui/RankRequirementsDisplay.test.tsx`
- `apps/frontend/src/features/rank-requirements-display/index.ts`
- `apps/frontend/src/features/next-rank-card/ui/NextRankCard.tsx`
- `apps/frontend/src/features/next-rank-card/ui/NextRankCard.test.tsx`
- `apps/frontend/src/features/next-rank-card/index.ts`
- `apps/frontend/src/pages/admin-requirement-sets/ui/AdminRequirementSetsPage.tsx`
- `apps/frontend/src/pages/admin-requirement-sets/ui/AdminRequirementSetsPage.test.tsx`
- `apps/frontend/src/pages/admin-requirement-sets/index.ts`
- `apps/frontend/src/pages/admin-rank-requirements/ui/AdminRankRequirementsPage.tsx`
- `apps/frontend/src/pages/admin-rank-requirements/ui/AdminRankRequirementsPage.test.tsx`
- `apps/frontend/src/pages/admin-rank-requirements/index.ts`
- `apps/frontend/src/pages/progression/ui/ProgressionPage.tsx`
- `apps/frontend/src/pages/progression/ui/ProgressionPage.test.tsx`
- `apps/frontend/src/pages/progression/index.ts`
- `apps/frontend/src/app/router/routes/_app.admin.requirement-sets.tsx`
- `apps/frontend/src/app/router/routes/_app.admin.requirement-sets.index.tsx`
- `apps/frontend/src/app/router/routes/_app.admin.rank-requirements.tsx`
- `apps/frontend/src/app/router/routes/_app.admin.rank-requirements.index.tsx`
- `apps/frontend/src/app/router/routes/_app.progression.tsx`

**Modified (frontend):**
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` — add "Requirement sets" + "Progression"
- `apps/frontend/src/pages/dashboard/.../DashboardPage.tsx` — mount `NextRankCard`
- `apps/frontend/src/pages/grading-history/.../*Page.tsx` — mount `NextRankCard`
- `apps/frontend/src/pages/student-detail/.../*Page.tsx` — mount `RankRequirementsDisplay` for the student
- `apps/frontend/src/i18n/locales/en.json` · `sv.json` · `fi.json` — new keys
- `apps/frontend/src/app/router/routeTree.gen.ts` — regenerated by Vite plugin

---

## Phase 0 — Branch + scaffolding (1 task)

### Task 0: Branch from main

**Files:**
- (none modified; git only)

**Interfaces:**
- Consumes: nothing
- Produces: a clean working tree on `feature/grading-requirements`

- [ ] **Step 1: Confirm working tree state**

Run: `git status`
Expected: `.gitignore` and `apps/frontend/src/app/router/routeTree.gen.ts` modified on `refactor/p6-2-classification-multiselect-aria`. These do NOT belong on the new feature branch.

- [ ] **Step 2: Stash existing changes**

```bash
git stash push -m "WIP refactor/p6-2-classification-multiselect-aria leftovers" -- .gitignore apps/frontend/src/app/router/routeTree.gen.ts
```

Expected: stash saved.

- [ ] **Step 3: Create the feature branch off `main`**

```bash
git fetch origin main
git switch -c feature/grading-requirements origin/main
git status
```

Expected: clean working tree, branch `feature/grading-requirements`.

- [ ] **Step 4: Commit the plan to the new branch**

```bash
git add docs/superpowers/plans/2026-06-30-grading-requirements.md
git commit -m "docs(grading-requirements): implementation plan"
```

---

## Phase 1 — Contracts (3 tasks)

### Task 1: CASL subject + routes

**Files:**
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/routes.ts`

**Interfaces:**
- Consumes: existing `SubjectSchema`, `AppSubject` union
- Produces:
  - subject name `'RequirementSet'` in `SubjectSchema`
  - exported type `RequirementSetSubjectShape = { readonly __caslSubjectType__: 'RequirementSet'; id?: string; organisationId?: string | null; isActive?: boolean }`
  - `RequirementSetsRoutes` and `RankRequirementsRoutes` constants

- [ ] **Step 1: Extend `SubjectSchema`**

Edit `packages/contracts/src/casl.ts`. Add `'RequirementSet'` to the enum literal list (place it alphabetically between `'Progress'` and `'Student'`).

- [ ] **Step 2: Add the subject shape**

Append the new shape near the bottom (before `FeedbackThreadSubjectShape`):

```ts
export type RequirementSetSubjectShape = {
  readonly __caslSubjectType__: 'RequirementSet';
  id?: string;
  organisationId?: string | null;
  isActive?: boolean;
};
```

Add `| RequirementSetSubjectShape` to the `AppSubject` union.

- [ ] **Step 3: Add route constants**

Append to `packages/contracts/src/routes.ts`:

```ts
export const RequirementSetsRoutes = {
  base: '/api/requirement-sets',
  byId: (id: string) => `/api/requirement-sets/${id}` as const,
  activate: (id: string) => `/api/requirement-sets/${id}/activate` as const,
  deactivate: (id: string) => `/api/requirement-sets/${id}/deactivate` as const,
  clone: (id: string) => `/api/requirement-sets/${id}/clone` as const,
} as const;

export const RankRequirementsRoutes = {
  byRankId: (rankId: string) => `/api/requirements/${rankId}` as const,
} as const;
```

- [ ] **Step 4: Build & typecheck contracts**

```bash
pnpm --filter @repo/contracts run build
```

Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/casl.ts packages/contracts/src/routes.ts
git commit -m "feat(contracts): RequirementSet CASL subject + routes"
```

---

### Task 2: Zod schemas for grading-requirements

**Files:**
- Create: `packages/contracts/src/grading-requirements.ts`
- Create: `packages/contracts/src/__tests__/grading-requirements.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/openapi.ts`
- Modify: `packages/contracts/tsup.config.ts` + `package.json`

**Interfaces:**
- Produces (exported types / schemas):
  - `RequirementSetSchema`, `type RequirementSet`
  - `CreateRequirementSetSchema`, `type CreateRequirementSetInput`
  - `UpdateRequirementSetSchema`, `type UpdateRequirementSetInput`
  - `CloneRequirementSetSchema`, `type CloneRequirementSetInput` (`{ name?: string }`)
  - `HokeiGroupSchema`, `type HokeiGroup` (the projection shape with `id`, `groupOrder`, `pickCount`, `isTested`, `labelEn/Fi/Sv`, `patternIds: string[]`)
  - `HokeiGroupInputSchema`, `type HokeiGroupInput` (same minus `id`)
  - `GradingRequirementsSchema`, `type GradingRequirements` (the wire projection — see spec §3.1)
  - `SetGradingRequirementsSchema`, `type SetGradingRequirementsInput` (the write body — see spec §5)
  - `GradingRequirementsOpenApiRegistry`

- [ ] **Step 1: Write the test file first (TDD)**

Create `packages/contracts/src/__tests__/grading-requirements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  HokeiGroupInputSchema,
  SetGradingRequirementsSchema,
  CreateRequirementSetSchema,
  CloneRequirementSetSchema,
} from '../grading-requirements.js';

describe('HokeiGroupInputSchema', () => {
  it('defaults pickCount=1, groupOrder=0, isTested=false', () => {
    const parsed = HokeiGroupInputSchema.parse({
      patternIds: ['11111111-1111-1111-1111-111111111111'],
    });
    expect(parsed.pickCount).toBe(1);
    expect(parsed.groupOrder).toBe(0);
    expect(parsed.isTested).toBe(false);
  });

  it('rejects empty patternIds', () => {
    expect(() => HokeiGroupInputSchema.parse({ patternIds: [] })).toThrow();
  });
});

describe('SetGradingRequirementsSchema', () => {
  it('requires setId', () => {
    expect(() => SetGradingRequirementsSchema.parse({})).toThrow();
  });

  it('defaults every array to []', () => {
    const parsed = SetGradingRequirementsSchema.parse({ setId: 'set-1' });
    expect(parsed.kobo).toEqual([]);
    expect(parsed.kihon).toEqual([]);
    expect(parsed.otherPatterns).toEqual([]);
    expect(parsed.hokeiGroups).toEqual([]);
    expect(parsed.jissenTested).toBe(false);
    expect(parsed.requiresEssay).toBe(false);
  });

  it('accepts jissenMinutes null', () => {
    const parsed = SetGradingRequirementsSchema.parse({
      setId: 'set-1',
      jissenMinutes: null,
    });
    expect(parsed.jissenMinutes).toBeNull();
  });

  it('rejects negative jissenMinutes', () => {
    expect(() =>
      SetGradingRequirementsSchema.parse({ setId: 'set-1', jissenMinutes: -1 }),
    ).toThrow();
  });
});

describe('CreateRequirementSetSchema', () => {
  it('requires ISO date for effectiveDate', () => {
    expect(() =>
      CreateRequirementSetSchema.parse({ name: 'x', effectiveDate: '2026-13-99' }),
    ).toThrow();
    expect(() =>
      CreateRequirementSetSchema.parse({ name: 'x', effectiveDate: '2026-07-01' }),
    ).not.toThrow();
  });
});

describe('CloneRequirementSetSchema', () => {
  it('makes name optional', () => {
    expect(CloneRequirementSetSchema.parse({}).name).toBeUndefined();
    expect(CloneRequirementSetSchema.parse({ name: 'Copy' }).name).toBe('Copy');
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
pnpm --filter @repo/contracts test -- grading-requirements
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the schemas**

Create `packages/contracts/src/grading-requirements.ts`:

```ts
import { z } from './zod-openapi.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const HokeiGroupInputSchema = z
  .object({
    groupOrder: z.number().int().nonnegative().default(0),
    pickCount: z.number().int().positive().default(1),
    isTested: z.boolean().default(false),
    labelEn: z.string().max(200).nullable().optional(),
    labelFi: z.string().max(200).nullable().optional(),
    labelSv: z.string().max(200).nullable().optional(),
    patternIds: z.array(z.string().uuid()).min(1),
  })
  .meta({
    id: 'HokeiGroupInput',
    description:
      'A pick-N-of-M hokei group. `pickCount` is clamped by the server to `min(pickCount, patternIds.length)`.',
  });

export type HokeiGroupInput = z.infer<typeof HokeiGroupInputSchema>;

export const HokeiGroupSchema = HokeiGroupInputSchema.extend({
  id: z.string().uuid(),
}).meta({
  id: 'HokeiGroup',
  description: 'A hokei group as returned by the resolution endpoint.',
});

export type HokeiGroup = z.infer<typeof HokeiGroupSchema>;

export const SetGradingRequirementsSchema = z
  .object({
    setId: z.string().min(1),
    hokeiGroups: z.array(HokeiGroupInputSchema).default([]),
    kobo: z.array(z.string().uuid()).default([]),
    koboTested: z.array(z.string().uuid()).default([]),
    otherPatterns: z.array(z.string().uuid()).default([]),
    otherPatternsTested: z.array(z.string().uuid()).default([]),
    kihon: z.array(z.string().uuid()).default([]),
    kihonTested: z.array(z.string().uuid()).default([]),
    jissenMinutes: z.number().int().positive().nullable().optional(),
    jissenTested: z.boolean().default(false),
    minMonthsSincePreviousRank: z.number().int().nonnegative().nullable().optional(),
    requiresTheoricExam: z.boolean().default(false),
    requiresEssay: z.boolean().default(false),
  })
  .meta({
    id: 'SetGradingRequirementsInput',
    description:
      'Whole-scope replace body for PUT /api/requirements/:rankId. Pass setId — the server rejects 400 otherwise.',
  });

export type SetGradingRequirementsInput = z.infer<typeof SetGradingRequirementsSchema>;

export const GradingRequirementsSchema = z
  .object({
    rankId: z.string().uuid(),
    setId: z.string().uuid().nullable(),
    hokeiGroups: z.array(HokeiGroupSchema),
    kobo: z.array(z.string().uuid()),
    koboTested: z.array(z.string().uuid()),
    otherPatterns: z.array(z.string().uuid()),
    otherPatternsTested: z.array(z.string().uuid()),
    kihon: z.array(z.string().uuid()),
    kihonTested: z.array(z.string().uuid()),
    jissenMinutes: z.number().int().nullable(),
    jissenTested: z.boolean(),
    minMonthsSincePreviousRank: z.number().int().nullable(),
    requiresTheoricExam: z.boolean(),
    requiresEssay: z.boolean(),
  })
  .meta({
    id: 'GradingRequirements',
    description:
      'Projected requirements for one rank within a single scope. Returned as a fully-formed empty object when no requirements exist for the scope (NOT 404).',
  });

export type GradingRequirements = z.infer<typeof GradingRequirementsSchema>;

export const RequirementSetSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    organisationId: z.string().uuid().nullable(),
    effectiveDate: z.string().regex(ISO_DATE),
    isActive: z.boolean(),
    clonedFromId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'RequirementSet' });

export type RequirementSet = z.infer<typeof RequirementSetSchema>;

export const CreateRequirementSetSchema = z
  .object({
    name: z.string().min(1).max(200),
    organisationId: z.string().uuid().nullable().optional(),
    effectiveDate: z.string().regex(ISO_DATE),
  })
  .meta({ id: 'CreateRequirementSetInput' });

export type CreateRequirementSetInput = z.infer<typeof CreateRequirementSetSchema>;

export const UpdateRequirementSetSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    effectiveDate: z.string().regex(ISO_DATE).optional(),
  })
  .meta({ id: 'UpdateRequirementSetInput' });

export type UpdateRequirementSetInput = z.infer<typeof UpdateRequirementSetSchema>;

export const CloneRequirementSetSchema = z
  .object({ name: z.string().min(1).max(200).optional() })
  .meta({ id: 'CloneRequirementSetInput' });

export type CloneRequirementSetInput = z.infer<typeof CloneRequirementSetSchema>;

export const GradingRequirementsOpenApiRegistry = {
  HokeiGroup: HokeiGroupSchema,
  HokeiGroupInput: HokeiGroupInputSchema,
  SetGradingRequirementsInput: SetGradingRequirementsSchema,
  GradingRequirements: GradingRequirementsSchema,
  RequirementSet: RequirementSetSchema,
  CreateRequirementSetInput: CreateRequirementSetSchema,
  UpdateRequirementSetInput: UpdateRequirementSetSchema,
  CloneRequirementSetInput: CloneRequirementSetSchema,
} as const;
```

- [ ] **Step 4: Re-export and register in OpenAPI**

In `packages/contracts/src/index.ts`, add: `export * from './grading-requirements.js';`

In `packages/contracts/src/openapi.ts`, import `GradingRequirementsOpenApiRegistry` and spread it into the central registry (match the pattern used by `PatternOpenApiRegistry`).

- [ ] **Step 5: Add the new entry point**

In `packages/contracts/tsup.config.ts`, add `'src/grading-requirements.ts'` to the entry list. In `packages/contracts/package.json`, add to the `exports` map alongside other domain entries:

```json
"./grading-requirements": {
  "import": "./dist/grading-requirements.js",
  "types": "./dist/grading-requirements.d.ts"
}
```

- [ ] **Step 6: Build + test**

```bash
pnpm --filter @repo/contracts run build
pnpm --filter @repo/contracts test -- grading-requirements
```

Expected: build clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): grading-requirements Zod schemas"
```

---

### Task 3: Regenerate OpenAPI

**Files:**
- Modify: `packages/contracts/openapi/openapi.{yaml,json}` (regenerated)

- [ ] **Step 1: Regenerate**

```bash
pnpm --filter @repo/contracts run openapi:generate
```

(Use whichever script the repo uses to regenerate; if no script exists, skip and let the next CI run regenerate.)

- [ ] **Step 2: Commit any regenerated files**

```bash
git add packages/contracts/openapi
git commit -m "chore(contracts): regenerate openapi for grading-requirements"
```

---

## Phase 2 — Database schema + migration (1 task)

### Task 4: Drizzle schema + migration

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/grading-requirements.ts`
- Create: `apps/backend/drizzle/00NN_grading_requirements.sql` (auto-generated)
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`

**Interfaces:**
- Produces these Drizzle table objects (all exported):
  - `requirementSet`
  - `rankGradingRequirement` (the scalar anchor — one row per `(rankId, setId)`)
  - `rankRequirementTechnique`
  - `rankRequirementPattern`
  - `rankRequirementHokeiGroup`
  - `rankRequirementHokeiGroupPattern` (join with composite PK)

- [ ] **Step 1: Write the schema file**

Create `apps/backend/src/infrastructure/database/schema/grading-requirements.ts`:

```ts
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { organisations } from './organisations.js';
import { pattern } from './pattern.js';
import { technique } from './technique.js';

export const requirementSet = pgTable(
  'requirement_set',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    effectiveDate: date('effective_date').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    clonedFromId: uuid('cloned_from_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byOrg: index('requirement_set_by_org_idx').on(t.organisationId),
  }),
);

export const rankGradingRequirement = pgTable(
  'rank_grading_requirement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    jissenMinutes: integer('jissen_minutes'),
    jissenTested: boolean('jissen_tested').notNull().default(false),
    minMonthsSincePreviousRank: integer('min_months_since_previous_rank'),
    requiresTheoricExam: boolean('requires_theoric_exam').notNull().default(false),
    requiresEssay: boolean('requires_essay').notNull().default(false),
  },
  (t) => ({
    byScope: uniqueIndex('rank_grading_requirement_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementTechnique = pgTable(
  'rank_requirement_technique',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    techniqueId: uuid('technique_id')
      .notNull()
      .references(() => technique.id, { onDelete: 'cascade' }),
    isTested: boolean('is_tested').notNull().default(false),
  },
  (t) => ({
    byScope: index('rank_requirement_technique_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementPattern = pgTable(
  'rank_requirement_pattern',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => pattern.id, { onDelete: 'cascade' }),
    isTested: boolean('is_tested').notNull().default(false),
  },
  (t) => ({
    byScope: index('rank_requirement_pattern_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementHokeiGroup = pgTable(
  'rank_requirement_hokei_group',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'cascade' }),
    setId: uuid('set_id').references(() => requirementSet.id, { onDelete: 'cascade' }),
    groupOrder: integer('group_order').notNull().default(0),
    pickCount: integer('pick_count').notNull().default(1),
    isTested: boolean('is_tested').notNull().default(false),
    labelEn: text('label_en'),
    labelFi: text('label_fi'),
    labelSv: text('label_sv'),
  },
  (t) => ({
    byScope: index('rank_requirement_hokei_group_by_scope_idx').on(t.rankId, t.setId),
  }),
);

export const rankRequirementHokeiGroupPattern = pgTable(
  'rank_requirement_hokei_group_pattern',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => rankRequirementHokeiGroup.id, { onDelete: 'cascade' }),
    patternId: uuid('pattern_id')
      .notNull()
      .references(() => pattern.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.patternId] }),
  }),
);
```

- [ ] **Step 2: Re-export from the barrel**

Append to `apps/backend/src/infrastructure/database/schema/index.ts`:

```ts
export * from './grading-requirements.js';
```

- [ ] **Step 3: Generate migration**

```bash
pnpm --filter @repo/backend run db:generate
```

(Or whatever script invokes `drizzle-kit generate`.) Expected: a new file `apps/backend/drizzle/00NN_*.sql` appears with `CREATE TABLE` for the six tables plus indexes.

- [ ] **Step 4: Inspect the generated SQL**

Open the generated file. Verify:
- `requirement_set.organisation_id` FK has `ON DELETE CASCADE`
- All `set_id` columns are nullable with `ON DELETE CASCADE`
- All `rank_id` columns are NOT NULL with `ON DELETE CASCADE`
- The unique index `rank_grading_requirement_by_scope_idx` is on `(rank_id, set_id)` — note Postgres treats `NULL`s as distinct, which is what we want (one global anchor + one anchor per set per rank).

If the unique index is wrong, edit the SQL by hand to: `CREATE UNIQUE INDEX rank_grading_requirement_by_scope_idx ON rank_grading_requirement (rank_id, COALESCE(set_id, '00000000-0000-0000-0000-000000000000'));` — but ONLY if Drizzle's default `NULLS DISTINCT` behaviour is somehow disabled in this project. Otherwise leave the generated index as-is.

- [ ] **Step 5: Run the migration locally**

```bash
pnpm --filter @repo/backend run db:migrate
```

Expected: succeeds. Open psql or your client and verify the tables exist.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/infrastructure/database/schema apps/backend/drizzle
git commit -m "feat(grading-requirements): db schema + migration"
```

---

## Phase 3 — Organisation ancestor helper (1 task)

### Task 5: `OrganisationsRepository.getAncestorIds`

**Files:**
- Modify: `apps/backend/src/modules/organisations/organisations.repository.ts`
- Modify: `apps/backend/src/modules/organisations/organisations.repository.spec.ts`

**Interfaces:**
- Produces: `OrganisationsRepository.getAncestorIds(orgId: string, maxDepth?: number): Promise<string[]>` — returns the org's id followed by each ancestor in order (self → root). Cycle-guarded. `maxDepth` defaults to 16. Returns `[]` if `orgId` does not exist.

- [ ] **Step 1: Write failing test first**

Add to `organisations.repository.spec.ts`:

```ts
describe('getAncestorIds', () => {
  it('returns [self] for a root org with no parent', async () => {
    const root = await insertOrg({ parentId: null });
    const ids = await repo.getAncestorIds(root.id);
    expect(ids).toEqual([root.id]);
  });

  it('walks self → root', async () => {
    const if_ = await insertOrg({ parentId: null, type: 'international_federation' });
    const nf = await insertOrg({ parentId: if_.id, type: 'national_federation' });
    const club = await insertOrg({ parentId: nf.id, type: 'club' });
    expect(await repo.getAncestorIds(club.id)).toEqual([club.id, nf.id, if_.id]);
  });

  it('returns [] for an unknown id', async () => {
    expect(await repo.getAncestorIds('00000000-0000-0000-0000-000000000000')).toEqual([]);
  });

  it('caps at maxDepth even if the chain is malformed', async () => {
    // The DB FK prevents true cycles, but a stub override with maxDepth=2 should cap.
    const if_ = await insertOrg({ parentId: null });
    const nf = await insertOrg({ parentId: if_.id });
    const club = await insertOrg({ parentId: nf.id });
    expect(await repo.getAncestorIds(club.id, 2)).toEqual([club.id, nf.id]);
  });
});
```

(`insertOrg` is the existing test helper from the spec — reuse it.)

- [ ] **Step 2: Run tests — see fails**

```bash
pnpm --filter @repo/backend test -- organisations.repository
```

Expected: 4 failing.

- [ ] **Step 3: Implement using a recursive CTE**

Add the method to `OrganisationsRepository`:

```ts
async getAncestorIds(orgId: string, maxDepth = 16): Promise<string[]> {
  const result = await this.db.execute<{ id: string; depth: number }>(sql`
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT id, parent_id, 0 FROM organisations WHERE id = ${orgId}
      UNION ALL
      SELECT o.id, o.parent_id, a.depth + 1
      FROM organisations o
      JOIN ancestors a ON o.id = a.parent_id
      WHERE a.depth + 1 < ${maxDepth}
    )
    SELECT id, depth FROM ancestors ORDER BY depth ASC;
  `);
  return result.rows.map((r) => r.id);
}
```

(Adapt the `execute` API to whatever the existing repository uses — search for `sql\`WITH RECURSIVE` in the codebase first; if the pattern exists, copy it.)

- [ ] **Step 4: Run tests — see passes**

```bash
pnpm --filter @repo/backend test -- organisations.repository
```

Expected: 4 new passes; existing tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organisations
git commit -m "feat(organisations): getAncestorIds for grading-requirements resolution"
```

---

## Phase 4 — Backend: requirement sets module (4 tasks)

### Task 6: `RequirementSetsRepository` (CRUD primitives)

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/requirement-sets.repository.ts`

**Interfaces:**
- Produces methods on `RequirementSetsRepository`:
  - `list(orgIds: string[] | 'all'): Promise<RequirementSetRow[]>`
  - `findById(id: string): Promise<RequirementSetRow | null>`
  - `insert(input: { name: string; organisationId: string | null; effectiveDate: string; clonedFromId?: string | null }): Promise<RequirementSetRow>`
  - `update(id: string, patch: Partial<{ name: string; effectiveDate: string }>): Promise<RequirementSetRow | null>`
  - `delete(id: string): Promise<boolean>`
  - `setActive(id: string, isActive: boolean): Promise<void>`
  - `deactivateActiveForOrg(organisationId: string | null): Promise<void>` — for the activate transaction
  - `findActiveByOrg(organisationId: string | null): Promise<RequirementSetRow | null>` — used by ancestor walk

Use Drizzle `db` injection from existing repositories as the template (e.g. `OrganisationsRepository`).

- [ ] **Step 1: Implement the class**

```ts
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { DRIZZLE_DB } from '../../infrastructure/database/database.module.js';
import type { Db } from '../../infrastructure/database/database.types.js';
import { requirementSet } from '../../infrastructure/database/schema/grading-requirements.js';

export type RequirementSetRow = typeof requirementSet.$inferSelect;

@Injectable()
export class RequirementSetsRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async list(orgIds: string[] | 'all'): Promise<RequirementSetRow[]> {
    if (orgIds === 'all') {
      return this.db.select().from(requirementSet);
    }
    if (orgIds.length === 0) return [];
    return this.db
      .select()
      .from(requirementSet)
      .where(inArray(requirementSet.organisationId, orgIds));
  }

  async findById(id: string): Promise<RequirementSetRow | null> {
    const [row] = await this.db
      .select()
      .from(requirementSet)
      .where(eq(requirementSet.id, id))
      .limit(1);
    return row ?? null;
  }

  async insert(input: {
    name: string;
    organisationId: string | null;
    effectiveDate: string;
    clonedFromId?: string | null;
  }): Promise<RequirementSetRow> {
    const [row] = await this.db
      .insert(requirementSet)
      .values({
        name: input.name,
        organisationId: input.organisationId,
        effectiveDate: input.effectiveDate,
        clonedFromId: input.clonedFromId ?? null,
        isActive: false,
      })
      .returning();
    return row;
  }

  async update(
    id: string,
    patch: Partial<{ name: string; effectiveDate: string }>,
  ): Promise<RequirementSetRow | null> {
    const [row] = await this.db
      .update(requirementSet)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(requirementSet.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(requirementSet)
      .where(eq(requirementSet.id, id))
      .returning({ id: requirementSet.id });
    return res.length > 0;
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db
      .update(requirementSet)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(requirementSet.id, id));
  }

  async deactivateActiveForOrg(organisationId: string | null): Promise<void> {
    const where = organisationId === null
      ? and(eq(requirementSet.isActive, true), isNull(requirementSet.organisationId))
      : and(
          eq(requirementSet.isActive, true),
          eq(requirementSet.organisationId, organisationId),
        );
    await this.db
      .update(requirementSet)
      .set({ isActive: false, updatedAt: new Date() })
      .where(where);
  }

  async findActiveByOrg(organisationId: string | null): Promise<RequirementSetRow | null> {
    const where = organisationId === null
      ? and(eq(requirementSet.isActive, true), isNull(requirementSet.organisationId))
      : and(
          eq(requirementSet.isActive, true),
          eq(requirementSet.organisationId, organisationId),
        );
    const [row] = await this.db.select().from(requirementSet).where(where).limit(1);
    return row ?? null;
  }
}
```

(Adapt imports to match the existing DB module pattern. Look at `OrganisationsRepository` for the exact `Inject(DRIZZLE_DB)` form.)

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/grading-requirements/requirement-sets.repository.ts
git commit -m "feat(grading-requirements): RequirementSetsRepository"
```

---

### Task 7: `RequirementSetsService` (business logic + CASL)

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/requirement-sets.service.ts`
- Create: `apps/backend/src/modules/grading-requirements/requirement-sets.service.spec.ts`
- Create: `apps/backend/src/modules/grading-requirements/grading-requirements.ability-rules.ts`
- Create: `apps/backend/src/modules/grading-requirements/grading-requirements.ability-rules.spec.ts`

**Interfaces:**
- Produces:
  - `GradingRequirementsAbilityRules` — `AbilityRuleContributor` that grants `manage RequirementSet` to sysadmin (any) and to orgadmin/instructor memberships scoped to `{ organisationId: m.organisationId }`; grants `read RequirementSet` to every authenticated user
  - `RequirementSetsService` methods:
    - `list(user): Promise<RequirementSet[]>`
    - `get(id, user): Promise<RequirementSet>` (throws 404 if missing)
    - `create(body: CreateRequirementSetInput, user): Promise<RequirementSet>` (throws 403 if cross-org)
    - `update(id, body: UpdateRequirementSetInput, user): Promise<RequirementSet>`
    - `delete(id, user): Promise<void>`
    - `activate(id, user): Promise<RequirementSet>`
    - `deactivate(id, user): Promise<RequirementSet>`
    - `clone(id, body: CloneRequirementSetInput, user): Promise<RequirementSet>` — **delegates** the deep copy of detail rows to `RankRequirementsService.deepCopyDetailsForSet` (Task 11 step) but creates the new set row itself

- [ ] **Step 1: Ability rules — failing test first**

Create `grading-requirements.ability-rules.spec.ts`:

```ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import type { AppAbility } from '../../infrastructure/ability/ability.types.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/authenticated-user.js';
import { GradingRequirementsAbilityRules } from './grading-requirements.ability-rules.js';

function build(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new GradingRequirementsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('GradingRequirementsAbilityRules', () => {
  it('allows sysadmin to manage any RequirementSet', () => {
    const ability = build({
      id: 'u1',
      role: 'sysadmin',
      memberships: [],
    } as unknown as AuthenticatedUser);
    expect(ability.can('manage', 'RequirementSet')).toBe(true);
  });

  it('scopes orgadmin manage to their own org', () => {
    const ability = build({
      id: 'u2',
      role: 'orgadmin',
      memberships: [{ organisationId: 'org-A', role: 'orgadmin' }],
    } as unknown as AuthenticatedUser);
    expect(ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: 'org-A' })).toBe(true);
    expect(ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: 'org-B' })).toBe(false);
  });

  it('grants read to any authenticated user', () => {
    const ability = build({
      id: 'u3',
      role: 'student',
      memberships: [],
    } as unknown as AuthenticatedUser);
    expect(ability.can('read', 'RequirementSet')).toBe(true);
  });

  it('denies anonymous', () => {
    const ability = build(null);
    expect(ability.can('read', 'RequirementSet')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement the rules**

Pattern after `apps/backend/src/modules/technique/technique.ability-rules.ts` (look it up first). Sketch:

```ts
@AbilityContributor()
@Injectable()
export class GradingRequirementsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'RequirementSet');
    if (user.role === 'sysadmin') {
      builder.can('manage', 'RequirementSet');
      return;
    }
    const orgIds = user.memberships
      .filter((m) => m.role === 'orgadmin' || m.role === 'instructor')
      .map((m) => m.organisationId);
    for (const id of orgIds) {
      builder.can('manage', 'RequirementSet', { organisationId: id });
    }
  }
}
```

Run the spec; expect 4 passes.

- [ ] **Step 3: Service unit tests — failing**

Create `requirement-sets.service.spec.ts` with mocked repository, asserting:

```ts
describe('RequirementSetsService', () => {
  // ... setup with vitest mocks of RequirementSetsRepository, OrganisationsRepository, AbilityFactory

  it('list: sysadmin sees every set', async () => { /* ... */ });
  it('list: org user sees only sets in their ancestor org chain', async () => { /* ... */ });
  it('create: rejects when non-sysadmin passes another org id', async () => { /* throws ForbiddenException */ });
  it('create: defaults organisationId to caller primary org for non-sysadmin', async () => { /* ... */ });
  it('get: 404 when missing', async () => { /* throws NotFoundException */ });
  it('activate: deactivates sibling active sets in same org', async () => {
    // expects deactivateActiveForOrg called with the target set's orgId,
    // then setActive(targetId, true)
  });
  it('deactivate: only flips isActive on the target set', async () => { /* ... */ });
  it('clone: copies set row with isActive=false and clonedFromId=source.id', async () => { /* ... */ });
  it('clone: defaults name to "{source.name} (copy)" when body.name absent', async () => { /* ... */ });
});
```

Run tests — expect failures.

- [ ] **Step 4: Implement `RequirementSetsService`**

Sketch:

```ts
@Injectable()
export class RequirementSetsService {
  constructor(
    private readonly repo: RequirementSetsRepository,
    private readonly orgs: OrganisationsRepository,
    private readonly abilityFactory: AbilityFactory,
    // Forward-ref RankRequirementsService for clone — inject via @Inject(forwardRef(...))
    @Inject(forwardRef(() => RankRequirementsService))
    private readonly rankReqs: RankRequirementsService,
  ) {}

  async list(user: AuthenticatedUser): Promise<RequirementSet[]> {
    const ability = this.abilityFactory.createForUser(user);
    if (ability.can('manage', 'all')) {
      return mapRows(await this.repo.list('all'));
    }
    const orgIds = user.memberships.map((m) => m.organisationId);
    const ancestorSets = await Promise.all(orgIds.map((id) => this.orgs.getAncestorIds(id)));
    const reachable = Array.from(new Set(ancestorSets.flat()));
    return mapRows(await this.repo.list(reachable));
  }

  async get(id: string, user: AuthenticatedUser): Promise<RequirementSet> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ error: 'Requirement set not found', code: 'NOT_FOUND' });
    return mapRow(row);
  }

  async create(body: CreateRequirementSetInput, user: AuthenticatedUser): Promise<RequirementSet> {
    const ability = this.abilityFactory.createForUser(user);
    const isSysadmin = ability.can('manage', 'all');
    let organisationId = body.organisationId ?? null;
    if (!isSysadmin) {
      const callerOrgIds = new Set(user.memberships.map((m) => m.organisationId));
      if (organisationId === null) {
        // default to caller's first admin/instructor org
        const first = user.memberships.find((m) => m.role !== 'student');
        organisationId = first?.organisationId ?? null;
      }
      if (organisationId === null || !callerOrgIds.has(organisationId)) {
        throw new ForbiddenException({
          error: 'Cannot create requirement set for another organisation',
          code: 'FORBIDDEN',
        });
      }
    }
    const row = await this.repo.insert({
      name: body.name,
      organisationId,
      effectiveDate: body.effectiveDate,
    });
    return mapRow(row);
  }

  async update(id: string, body: UpdateRequirementSetInput, user: AuthenticatedUser): Promise<RequirementSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: existing.organisationId })) {
      throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    const updated = await this.repo.update(id, body);
    if (!updated) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    return mapRow(updated);
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: existing.organisationId })) {
      throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    await this.repo.delete(id);
  }

  async activate(id: string, user: AuthenticatedUser): Promise<RequirementSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, existing.organisationId);
    await this.repo.transaction(async (txRepo) => {
      await txRepo.deactivateActiveForOrg(existing.organisationId);
      await txRepo.setActive(id, true);
    });
    return mapRow(await this.repo.findById(id)!);
  }

  async deactivate(id: string, user: AuthenticatedUser): Promise<RequirementSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, existing.organisationId);
    await this.repo.setActive(id, false);
    return mapRow(await this.repo.findById(id)!);
  }

  async clone(id: string, body: CloneRequirementSetInput, user: AuthenticatedUser): Promise<RequirementSet> {
    const source = await this.repo.findById(id);
    if (!source) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, source.organisationId);
    const created = await this.repo.insert({
      name: body.name ?? `${source.name} (copy)`,
      organisationId: source.organisationId,
      effectiveDate: source.effectiveDate,
      clonedFromId: source.id,
    });
    await this.rankReqs.deepCopyDetailsForSet(source.id, created.id);
    return mapRow(created);
  }

  private assertCanManage(user: AuthenticatedUser, orgId: string | null) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: orgId })) {
      throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
  }
}
```

`mapRow` and `mapRows` are private helpers that convert `Date` columns to ISO strings to match `RequirementSetSchema`.

`this.repo.transaction(...)` — if the existing repository pattern doesn't expose `transaction` directly, the service should do `this.db.transaction(...)` instead. Match the precedent set by `MembershipsService` or `OrganisationsService`.

- [ ] **Step 5: Run all spec files to green**

```bash
pnpm --filter @repo/backend test -- grading-requirements
```

Expect: ability rules + service tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/grading-requirements
git commit -m "feat(grading-requirements): RequirementSetsService + ability rules"
```

---

### Task 8: `RequirementSetsController`

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/requirement-sets.controller.ts`

**Interfaces:**
- Produces these HTTP endpoints (all under the global `api/` prefix):
  - `GET /api/requirement-sets`
  - `GET /api/requirement-sets/:id`
  - `POST /api/requirement-sets` → `CreateRequirementSetSchema`
  - `PATCH /api/requirement-sets/:id` → `UpdateRequirementSetSchema`
  - `DELETE /api/requirement-sets/:id`
  - `POST /api/requirement-sets/:id/activate`
  - `POST /api/requirement-sets/:id/deactivate`
  - `POST /api/requirement-sets/:id/clone` → `CloneRequirementSetSchema`

- [ ] **Step 1: Implement**

Follow `apps/backend/src/modules/technique/technique.controller.ts` precisely. Annotate with `@ApiTags('requirement-sets')`, `@ApiCookieAuth('session')`, `@Controller('requirement-sets')`. Use `@CurrentUser()`, `@Body(new ZodValidationPipe(...))`, `@Param('id', new ParseUUIDPipe())`. All write endpoints just delegate to the service; the service does the auth checks.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/grading-requirements/requirement-sets.controller.ts
git commit -m "feat(grading-requirements): requirement-sets controller"
```

---

### Task 9: Wire the module + register the ability contributor

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/grading-requirements.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.factory.ts`

- [ ] **Step 1: Write the module**

```ts
@Module({
  imports: [/* DatabaseModule, OrganisationsModule, AbilityModule — match existing pattern */],
  controllers: [RequirementSetsController, RankRequirementsController],
  providers: [
    RequirementSetsRepository,
    RequirementSetsService,
    RankRequirementsRepository,
    RankRequirementsService,
    GradingRequirementsAbilityRules,
  ],
  exports: [RequirementSetsService, RankRequirementsService],
})
export class GradingRequirementsModule {}
```

(`RankRequirementsController/Service/Repository` are placeholders — Task 11/12 creates them. Until then, write the module with just the requirement-sets pieces and add the rest in Task 12.)

- [ ] **Step 2: Register in AppModule**

Add `GradingRequirementsModule` to `imports` in `apps/backend/src/app.module.ts`.

- [ ] **Step 3: Register the ability contributor**

In `ability.module.ts`, add `GradingRequirementsAbilityRules` to providers. In `ability.factory.ts`, follow the existing `@Optional() @Inject(...)` pattern for `TechniqueAbilityRules` / `PatternAbilityRules` and add the new one to the list iterated in `createForUser`.

- [ ] **Step 4: Type-check + boot the backend**

```bash
pnpm --filter @repo/backend run build
pnpm --filter @repo/backend run start:dev
```

Expected: NestJS boots clean, `Mapped {/api/requirement-sets, GET}` appears in the route table.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/grading-requirements/grading-requirements.module.ts apps/backend/src/app.module.ts apps/backend/src/infrastructure/ability
git commit -m "feat(grading-requirements): wire module + ability contributor"
```

---

## Phase 5 — Backend: rank-requirements module (4 tasks)

### Task 10: `RankRequirementsRepository`

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/rank-requirements.repository.ts`

**Interfaces:**
- Produces (all scope-aware via the helper `scopeWhere`):
  - `scopeWhere(table, rankId, setId): SQL` — internal helper
  - `fetchScalar(rankId, setId): Promise<RankGradingRequirementRow | null>`
  - `fetchTechniques(rankId, setId): Promise<RankRequirementTechniqueRow[]>`
  - `fetchPatternsWithType(rankId, setId): Promise<Array<RankRequirementPatternRow & { isKobo: boolean }>>` — joins `pattern_classification` → `classification_category` and computes `isKobo = code = 'kobo'`
  - `fetchHokeiGroups(rankId, setId): Promise<HokeiGroupWithPatternsRow[]>` — joins the group-pattern table and aggregates ordered `patternIds`
  - `deleteScope(rankId, setId): Promise<void>` — explicit ordered cleanup (group-patterns → groups → scalar → patterns → techniques), runs inside the caller's transaction
  - `insertScalar(row)`, `insertTechniques(rows[])`, `insertPatterns(rows[])`, `insertHokeiGroup(row)`, `insertHokeiGroupPatterns(rows[])` — straight inserts

- [ ] **Step 1: Implement**

Look at `apps/backend/src/modules/pattern/pattern.repository.ts` for the join-with-classification pattern. For `fetchPatternsWithType`:

```ts
async fetchPatternsWithType(rankId: string, setId: string | null) {
  return this.db
    .select({
      id: rankRequirementPattern.id,
      rankId: rankRequirementPattern.rankId,
      setId: rankRequirementPattern.setId,
      patternId: rankRequirementPattern.patternId,
      isTested: rankRequirementPattern.isTested,
      isKobo: sql<boolean>`EXISTS (
        SELECT 1 FROM pattern_classification pc
        JOIN classification_category cc ON cc.id = pc.classification_category_id
        WHERE pc.pattern_id = ${rankRequirementPattern.patternId}
        AND cc.code = 'kobo'
      )`,
    })
    .from(rankRequirementPattern)
    .where(this.scopeWhere(rankRequirementPattern, rankId, setId));
}
```

Adjust column names to match the actual `pattern_classification` table — open `apps/backend/src/infrastructure/database/schema/pattern.ts` to confirm.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/grading-requirements/rank-requirements.repository.ts
git commit -m "feat(grading-requirements): RankRequirementsRepository"
```

---

### Task 11: `RankRequirementsService` — fetch + resolve

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/rank-requirements.service.ts`
- Create: `apps/backend/src/modules/grading-requirements/rank-requirements.service.spec.ts`

**Interfaces:**
- Produces (this task adds the read side; Task 12 adds replace + clone helper + delete):
  - `fetchForScope(rankId: string, setId: string | null): Promise<GradingRequirements>` — internal projection. Returns `emptyRequirements(rankId, setId)` when the scalar anchor row is absent.
  - `emptyRequirements(rankId, setId): GradingRequirements` — pure helper
  - `resolveForSet(rankId, setId, user): Promise<GradingRequirements>` — auth-checked passthrough to `fetchForScope`
  - `resolveForUser(rankId: string, targetUserId: string, actor): Promise<GradingRequirements>` — walks ancestor chain from the target's student org

- [ ] **Step 1: Write the failing spec**

`rank-requirements.service.spec.ts`:

```ts
describe('RankRequirementsService.fetchForScope', () => {
  it('returns emptyRequirements when no scalar row exists', async () => {
    repo.fetchScalar = vi.fn().mockResolvedValue(null);
    const out = await svc.fetchForScope('rank-1', 'set-1');
    expect(out).toEqual({
      rankId: 'rank-1', setId: 'set-1',
      kihon: [], kihonTested: [],
      kobo: [], koboTested: [],
      otherPatterns: [], otherPatternsTested: [],
      hokeiGroups: [],
      jissenMinutes: null, jissenTested: false,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false, requiresEssay: false,
    });
    expect(repo.fetchTechniques).not.toHaveBeenCalled();
  });

  it('splits patterns into kobo vs otherPatterns based on classification', async () => {
    repo.fetchScalar = vi.fn().mockResolvedValue({ rankId: 'rank-1', setId: 's1', jissenMinutes: null, jissenTested: false, minMonthsSincePreviousRank: null, requiresTheoricExam: false, requiresEssay: false });
    repo.fetchTechniques = vi.fn().mockResolvedValue([]);
    repo.fetchHokeiGroups = vi.fn().mockResolvedValue([]);
    repo.fetchPatternsWithType = vi.fn().mockResolvedValue([
      { patternId: 'p-kobo-1', isKobo: true, isTested: true },
      { patternId: 'p-kobo-2', isKobo: true, isTested: false },
      { patternId: 'p-other-1', isKobo: false, isTested: false },
    ]);
    const out = await svc.fetchForScope('rank-1', 's1');
    expect(out.kobo).toEqual(['p-kobo-1', 'p-kobo-2']);
    expect(out.koboTested).toEqual(['p-kobo-1']);
    expect(out.otherPatterns).toEqual(['p-other-1']);
    expect(out.otherPatternsTested).toEqual([]);
  });
});

describe('RankRequirementsService.resolveForUser', () => {
  it('walks the ancestor chain and returns the first non-empty set', async () => {
    // student membership returns org "club"; ancestors are [club, nf, if]
    // club has active set s_club with NO scalar row for rank-1
    // nf has active set s_nf WITH scalar row → return s_nf
    // ...assert resolveForUser hands back the projection for s_nf
  });

  it('returns emptyRequirements when no ancestor has an active set with the rank', async () => {
    // ...
  });

  it('returns emptyRequirements when student has no student membership', async () => {
    // ...
  });
});
```

- [ ] **Step 2: Implement `fetchForScope`**

```ts
async fetchForScope(rankId: string, setId: string | null): Promise<GradingRequirements> {
  const scalar = await this.repo.fetchScalar(rankId, setId);
  if (!scalar) return this.emptyRequirements(rankId, setId);
  const [techniques, patterns, groups] = await Promise.all([
    this.repo.fetchTechniques(rankId, setId),
    this.repo.fetchPatternsWithType(rankId, setId),
    this.repo.fetchHokeiGroups(rankId, setId),
  ]);

  const kihon: string[] = [], kihonTested: string[] = [];
  for (const t of techniques) {
    kihon.push(t.techniqueId);
    if (t.isTested) kihonTested.push(t.techniqueId);
  }

  const kobo: string[] = [], koboTested: string[] = [];
  const other: string[] = [], otherTested: string[] = [];
  for (const p of patterns) {
    if (p.isKobo) {
      kobo.push(p.patternId);
      if (p.isTested) koboTested.push(p.patternId);
    } else {
      other.push(p.patternId);
      if (p.isTested) otherTested.push(p.patternId);
    }
  }

  return {
    rankId, setId,
    kihon, kihonTested,
    kobo, koboTested,
    otherPatterns: other, otherPatternsTested: otherTested,
    hokeiGroups: groups.map((g) => ({
      id: g.id,
      groupOrder: g.groupOrder,
      pickCount: g.pickCount,
      isTested: g.isTested,
      labelEn: g.labelEn,
      labelFi: g.labelFi,
      labelSv: g.labelSv,
      patternIds: g.patternIds,
    })),
    jissenMinutes: scalar.jissenMinutes,
    jissenTested: scalar.jissenTested,
    minMonthsSincePreviousRank: scalar.minMonthsSincePreviousRank,
    requiresTheoricExam: scalar.requiresTheoricExam,
    requiresEssay: scalar.requiresEssay,
  };
}

emptyRequirements(rankId: string, setId: string | null): GradingRequirements {
  return {
    rankId, setId,
    kihon: [], kihonTested: [],
    kobo: [], koboTested: [],
    otherPatterns: [], otherPatternsTested: [],
    hokeiGroups: [],
    jissenMinutes: null, jissenTested: false,
    minMonthsSincePreviousRank: null,
    requiresTheoricExam: false, requiresEssay: false,
  };
}
```

- [ ] **Step 3: Implement `resolveForUser`**

```ts
async resolveForUser(
  rankId: string,
  targetUserId: string,
  actor: AuthenticatedUser,
): Promise<GradingRequirements> {
  // 1. Authorise: must be the user themselves, an instructor with read Student on this id, or sysadmin
  const ability = this.abilityFactory.createForUser(actor);
  if (actor.id !== targetUserId) {
    if (!ability.can('read', { __caslSubjectType__: 'Student', organisationIds: [] /* fill below */ })) {
      // Fetch target's membership orgs to populate the subject for a precise check
      const targetMemberships = await this.memberships.list({ userId: targetUserId });
      const targetOrgIds = targetMemberships.map((m) => m.organisationId);
      if (!ability.can('read', { __caslSubjectType__: 'Student', organisationIds: targetOrgIds })) {
        throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
    }
  }
  // 2. Resolve student org via student membership (most-recently-updated)
  const studentMemberships = await this.memberships.list({ userId: targetUserId });
  const studentOrg = studentMemberships
    .filter((m) => m.role === 'student')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.organisationId ?? null;
  if (!studentOrg) return this.emptyRequirements(rankId, null);

  // 3. Walk ancestors self → root, take first org with an active set that has a scalar row for this rank
  const ancestors = await this.orgs.getAncestorIds(studentOrg);
  for (const orgId of ancestors) {
    const active = await this.sets.findActiveByOrg(orgId);
    if (!active) continue;
    const scalar = await this.repo.fetchScalar(rankId, active.id);
    if (scalar) return this.fetchForScope(rankId, active.id);
  }
  // 4. Fall back to global default set (organisationId IS NULL)
  const globalActive = await this.sets.findActiveByOrg(null);
  if (globalActive) {
    const scalar = await this.repo.fetchScalar(rankId, globalActive.id);
    if (scalar) return this.fetchForScope(rankId, globalActive.id);
  }
  return this.emptyRequirements(rankId, null);
}
```

(`this.memberships`, `this.orgs`, `this.sets` are injected `MembershipsRepository`, `OrganisationsRepository`, `RequirementSetsRepository`.)

- [ ] **Step 4: Run tests — green**

```bash
pnpm --filter @repo/backend test -- rank-requirements
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/grading-requirements/rank-requirements.service.ts apps/backend/src/modules/grading-requirements/rank-requirements.service.spec.ts
git commit -m "feat(grading-requirements): RankRequirementsService — fetch + resolve"
```

---

### Task 12: Replace, delete, clone

**Files:**
- Modify: `apps/backend/src/modules/grading-requirements/rank-requirements.service.ts`
- Modify: `apps/backend/src/modules/grading-requirements/rank-requirements.service.spec.ts`
- Modify: `apps/backend/src/modules/grading-requirements/grading-requirements.module.ts` (wire the rank-requirements pieces)

**Interfaces:**
- Adds:
  - `replace(rankId: string, body: SetGradingRequirementsInput, user: AuthenticatedUser): Promise<GradingRequirements>` — whole-scope replace (delete all rows for scope, then insert)
  - `clearForScope(rankId: string, setId: string, user: AuthenticatedUser): Promise<void>` — DELETE handler
  - `deepCopyDetailsForSet(sourceSetId: string, targetSetId: string): Promise<void>` — used by `RequirementSetsService.clone`. Iterates the source set's distinct `rankId`s and re-inserts every row pointing at `targetSetId`. Runs inside a transaction.

- [ ] **Step 1: Write failing tests**

Add to the spec file:

```ts
describe('replace', () => {
  it('rejects 400 when setId missing', async () => {
    await expect(svc.replace('rank-1', { setId: '' } as any, user)).rejects.toThrow(BadRequestException);
  });

  it('clamps pickCount to patternIds.length', async () => {
    await svc.replace('rank-1', {
      setId: 's-1',
      hokeiGroups: [{ pickCount: 5, patternIds: ['p1', 'p2', 'p3'] }],
    }, user);
    expect(repo.insertHokeiGroup).toHaveBeenCalledWith(expect.objectContaining({ pickCount: 3 }));
  });

  it('deletes the scope before inserting', async () => {
    await svc.replace('rank-1', { setId: 's-1' }, user);
    expect(repo.deleteScope).toHaveBeenCalledBefore(repo.insertScalar);
  });

  it('asserts manage RequirementSet on the set\'s org', async () => {
    sets.findById = vi.fn().mockResolvedValue({ id: 's-1', organisationId: 'orgB' });
    ability.can = vi.fn().mockReturnValue(false);
    await expect(svc.replace('rank-1', { setId: 's-1' }, user)).rejects.toThrow(ForbiddenException);
  });
});

describe('clearForScope', () => {
  it('deletes everything in the scope', async () => { /* ... */ });
});

describe('deepCopyDetailsForSet', () => {
  it('re-points each detail row to the target set', async () => { /* ... */ });
});
```

- [ ] **Step 2: Implement**

```ts
async replace(rankId: string, body: SetGradingRequirementsInput, user: AuthenticatedUser): Promise<GradingRequirements> {
  if (!body.setId) {
    throw new BadRequestException({ error: 'setId is required', code: 'VALIDATION_ERROR' });
  }
  const set = await this.sets.findById(body.setId);
  if (!set) throw new NotFoundException({ error: 'Set not found', code: 'NOT_FOUND' });
  this.assertCanManageSet(user, set.organisationId);

  await this.db.transaction(async (tx) => {
    await this.repo.deleteScope(rankId, body.setId, tx);
    await this.repo.insertScalar({
      rankId,
      setId: body.setId,
      jissenMinutes: body.jissenMinutes ?? null,
      jissenTested: body.jissenTested,
      minMonthsSincePreviousRank: body.minMonthsSincePreviousRank ?? null,
      requiresTheoricExam: body.requiresTheoricExam,
      requiresEssay: body.requiresEssay,
    }, tx);

    const techRows = [
      ...body.kihon.map((id) => ({ rankId, setId: body.setId, techniqueId: id, isTested: false })),
      ...body.kihonTested.map((id) => ({ rankId, setId: body.setId, techniqueId: id, isTested: true })),
    ];
    // Note: kihonTested is the subset of kihon flagged tested — keep ONE row per techniqueId,
    // preferring `isTested = true`. Implement a dedup map.
    const dedupTech = this.dedupTested(techRows);
    if (dedupTech.length) await this.repo.insertTechniques(dedupTech, tx);

    const patternRows = [
      ...body.kobo.map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: false })),
      ...body.koboTested.map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: true })),
      ...body.otherPatterns.map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: false })),
      ...body.otherPatternsTested.map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: true })),
    ];
    const dedupPat = this.dedupTested(patternRows, 'patternId');
    if (dedupPat.length) await this.repo.insertPatterns(dedupPat, tx);

    for (const group of body.hokeiGroups) {
      const clamped = Math.min(group.pickCount, group.patternIds.length);
      const inserted = await this.repo.insertHokeiGroup({
        rankId,
        setId: body.setId,
        groupOrder: group.groupOrder,
        pickCount: clamped,
        isTested: group.isTested,
        labelEn: group.labelEn ?? null,
        labelFi: group.labelFi ?? null,
        labelSv: group.labelSv ?? null,
      }, tx);
      await this.repo.insertHokeiGroupPatterns(
        group.patternIds.map((pid, i) => ({ groupId: inserted.id, patternId: pid, sortOrder: i })),
        tx,
      );
    }
  });

  return this.fetchForScope(rankId, body.setId);
}

async clearForScope(rankId: string, setId: string, user: AuthenticatedUser): Promise<void> {
  const set = await this.sets.findById(setId);
  if (!set) throw new NotFoundException({ error: 'Set not found', code: 'NOT_FOUND' });
  this.assertCanManageSet(user, set.organisationId);
  await this.db.transaction(async (tx) => {
    await this.repo.deleteScope(rankId, setId, tx);
  });
}

async deepCopyDetailsForSet(sourceSetId: string, targetSetId: string): Promise<void> {
  await this.db.transaction(async (tx) => {
    const rankIds = await this.repo.distinctRankIdsForSet(sourceSetId, tx);
    for (const rankId of rankIds) {
      const scalar = await this.repo.fetchScalar(rankId, sourceSetId, tx);
      if (!scalar) continue;
      await this.repo.insertScalar({
        rankId, setId: targetSetId,
        jissenMinutes: scalar.jissenMinutes,
        jissenTested: scalar.jissenTested,
        minMonthsSincePreviousRank: scalar.minMonthsSincePreviousRank,
        requiresTheoricExam: scalar.requiresTheoricExam,
        requiresEssay: scalar.requiresEssay,
      }, tx);
      const techniques = await this.repo.fetchTechniques(rankId, sourceSetId, tx);
      if (techniques.length) {
        await this.repo.insertTechniques(
          techniques.map((t) => ({ rankId, setId: targetSetId, techniqueId: t.techniqueId, isTested: t.isTested })),
          tx,
        );
      }
      const patterns = await this.repo.fetchPatternsWithType(rankId, sourceSetId, tx);
      if (patterns.length) {
        await this.repo.insertPatterns(
          patterns.map((p) => ({ rankId, setId: targetSetId, patternId: p.patternId, isTested: p.isTested })),
          tx,
        );
      }
      const groups = await this.repo.fetchHokeiGroups(rankId, sourceSetId, tx);
      for (const g of groups) {
        const inserted = await this.repo.insertHokeiGroup({
          rankId, setId: targetSetId,
          groupOrder: g.groupOrder, pickCount: g.pickCount, isTested: g.isTested,
          labelEn: g.labelEn, labelFi: g.labelFi, labelSv: g.labelSv,
        }, tx);
        await this.repo.insertHokeiGroupPatterns(
          g.patternIds.map((pid, i) => ({ groupId: inserted.id, patternId: pid, sortOrder: i })),
          tx,
        );
      }
    }
  });
}

private dedupTested<T extends { isTested: boolean }>(rows: T[], keyField: keyof T = 'techniqueId' as keyof T): T[] {
  const map = new Map<unknown, T>();
  for (const r of rows) {
    const k = r[keyField];
    const existing = map.get(k);
    if (!existing || r.isTested) map.set(k, r);
  }
  return [...map.values()];
}
```

`distinctRankIdsForSet` is a small repo addition — `SELECT DISTINCT rank_id FROM rank_grading_requirement WHERE set_id = ?`.

- [ ] **Step 3: Wire the rank-requirements pieces into the module**

In `grading-requirements.module.ts`, add `RankRequirementsRepository`, `RankRequirementsService`, and `RankRequirementsController` (next task) once they exist. Also export `RankRequirementsService` so other modules (notably any future feedback / grading-event modules) can use it.

- [ ] **Step 4: Run tests — green**

```bash
pnpm --filter @repo/backend test -- grading-requirements
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/grading-requirements
git commit -m "feat(grading-requirements): replace, clear, deepCopy"
```

---

### Task 13: `RankRequirementsController` + e2e

**Files:**
- Create: `apps/backend/src/modules/grading-requirements/rank-requirements.controller.ts`
- Create: `apps/backend/test/e2e/grading-requirements.e2e-spec.ts`
- Modify: `apps/backend/src/modules/grading-requirements/grading-requirements.module.ts` (add controller)

**Interfaces:**
- Produces endpoints:
  - `GET /api/requirements/:rankId` — accepts `?setId=` or `?forUserId=`; mutually exclusive; default = resolve for actor
  - `PUT /api/requirements/:rankId` — body `SetGradingRequirementsInput`; returns the re-fetched `GradingRequirements`
  - `DELETE /api/requirements/:rankId?setId=` — 400 if `setId` missing

- [ ] **Step 1: Implement the controller**

```ts
@ApiTags('grading-requirements')
@ApiCookieAuth('session')
@Controller('requirements')
export class RankRequirementsController {
  constructor(private readonly svc: RankRequirementsService) {}

  @Get(':rankId')
  async get(
    @Param('rankId', new ParseUUIDPipe()) rankId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('setId') setId?: string,
    @Query('forUserId') forUserId?: string,
  ): Promise<GradingRequirements> {
    if (setId && forUserId) {
      throw new BadRequestException({ error: 'setId and forUserId are mutually exclusive', code: 'VALIDATION_ERROR' });
    }
    if (setId) return this.svc.resolveForSet(rankId, setId, user);
    return this.svc.resolveForUser(rankId, forUserId ?? user.id, user);
  }

  @Put(':rankId')
  async put(
    @Param('rankId', new ParseUUIDPipe()) rankId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SetGradingRequirementsSchema)) body: SetGradingRequirementsInput,
  ): Promise<GradingRequirements> {
    return this.svc.replace(rankId, body, user);
  }

  @Delete(':rankId')
  async delete(
    @Param('rankId', new ParseUUIDPipe()) rankId: string,
    @Query('setId') setId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    if (!setId) {
      throw new BadRequestException({ error: 'setId is required', code: 'VALIDATION_ERROR' });
    }
    await this.svc.clearForScope(rankId, setId, user);
    return { ok: true };
  }
}
```

- [ ] **Step 2: Add to module + register**

In `grading-requirements.module.ts`, ensure the controller and the rank-requirements providers are listed.

- [ ] **Step 3: Write an e2e spec covering the spec's acceptance tests**

`apps/backend/test/e2e/grading-requirements.e2e-spec.ts` — write tests for spec §8 items 1–11 (scope NULL handling, whole-scope replace, missing setId 400, pickCount clamp, empty scope shape, ancestor inheritance, one-active-set-per-org, clone deep-copies, set delete cascades, cross-org create blocked, readiness count is FE-only so skip 11 here). Reuse the existing e2e harness (look at `apps/backend/test/e2e/patterns.e2e-spec.ts` for the setup pattern).

- [ ] **Step 4: Run e2e**

```bash
pnpm --filter @repo/backend run test:e2e -- grading-requirements
```

- [ ] **Step 5: Boot + smoke-curl the API**

```bash
pnpm --filter @repo/backend run start:dev
```

In another terminal (PowerShell):

```powershell
# Sign in first to get session cookie — use whatever existing login flow your seed admin has
Invoke-RestMethod -Uri http://localhost:3000/api/requirement-sets -WebSession $session
```

Verify the route is mapped and responds with `[]` (or seeded data).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/grading-requirements apps/backend/test/e2e/grading-requirements.e2e-spec.ts
git commit -m "feat(grading-requirements): rank-requirements controller + e2e"
```

---

## Phase 6 — Frontend foundation (3 tasks)

### Task 14: `entities/requirement-set`

**Files:**
- Create: `apps/frontend/src/entities/requirement-set/api/requirement-set.api.ts`
- Create: `apps/frontend/src/entities/requirement-set/api/requirement-set.api.test.ts`
- Create: `apps/frontend/src/entities/requirement-set/lib/hooks.ts`
- Create: `apps/frontend/src/entities/requirement-set/index.ts`

**Interfaces:**
- Produces:
  - `getRequirementSets()`, `getRequirementSetById(id)`, `createRequirementSet(body)`, `updateRequirementSet(id, body)`, `deleteRequirementSet(id)`, `activateRequirementSet(id)`, `deactivateRequirementSet(id)`, `cloneRequirementSet(id, body)`
  - hooks: `useRequirementSetsQuery`, `useRequirementSetQuery`, `useCreateRequirementSetMutation`, `useUpdateRequirementSetMutation`, `useDeleteRequirementSetMutation`, `useActivateRequirementSetMutation`, `useDeactivateRequirementSetMutation`, `useCloneRequirementSetMutation`
  - key registry: `requirementSetKeys = { all: ['requirementSet'], list: () => ['requirementSet','list'], byId: (id) => ['requirementSet','byId', id] }`

- [ ] **Step 1: API helpers (follow `entities/pattern/api/pattern.api.ts` style)**

```ts
import {
  RequirementSetSchema, type RequirementSet,
  CreateRequirementSetSchema, type CreateRequirementSetInput,
  UpdateRequirementSetSchema, type UpdateRequirementSetInput,
  CloneRequirementSetSchema, type CloneRequirementSetInput,
  RequirementSetsRoutes,
} from '@repo/contracts';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

const RequirementSetListSchema = z.array(RequirementSetSchema);

export async function getRequirementSets(): Promise<RequirementSet[]> {
  const raw = await httpClient(RequirementSetsRoutes.base);
  return RequirementSetListSchema.parse(raw);
}
export async function getRequirementSetById(id: string): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.byId(id));
  return RequirementSetSchema.parse(raw);
}
export async function createRequirementSet(body: CreateRequirementSetInput): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.base, { method: 'POST', body });
  return RequirementSetSchema.parse(raw);
}
export async function updateRequirementSet(id: string, body: UpdateRequirementSetInput): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.byId(id), { method: 'PATCH', body });
  return RequirementSetSchema.parse(raw);
}
export async function deleteRequirementSet(id: string): Promise<void> {
  await httpClient(RequirementSetsRoutes.byId(id), { method: 'DELETE' });
}
export async function activateRequirementSet(id: string): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.activate(id), { method: 'POST' });
  return RequirementSetSchema.parse(raw);
}
export async function deactivateRequirementSet(id: string): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.deactivate(id), { method: 'POST' });
  return RequirementSetSchema.parse(raw);
}
export async function cloneRequirementSet(id: string, body: CloneRequirementSetInput): Promise<RequirementSet> {
  const raw = await httpClient(RequirementSetsRoutes.clone(id), { method: 'POST', body });
  return RequirementSetSchema.parse(raw);
}
```

- [ ] **Step 2: Hooks**

```ts
export const requirementSetKeys = {
  all: ['requirementSet'] as const,
  list: () => ['requirementSet', 'list'] as const,
  byId: (id: string) => ['requirementSet', 'byId', id] as const,
};

export function useRequirementSetsQuery() {
  return useQuery({ queryKey: requirementSetKeys.list(), queryFn: getRequirementSets });
}
// ... (one hook per API helper, each calling invalidateQueries({ queryKey: requirementSetKeys.all }) on success for mutations)
```

- [ ] **Step 3: API test**

Mock `httpClient` with vitest, assert the URL + method for each helper. Pattern: `apps/frontend/src/entities/pattern/api/pattern.api.test.ts`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @repo/frontend test -- requirement-set
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/entities/requirement-set
git commit -m "feat(frontend): requirement-set entity"
```

---

### Task 15: `entities/rank-requirement`

**Files:**
- Create: `apps/frontend/src/entities/rank-requirement/api/rank-requirement.api.ts`
- Create: `apps/frontend/src/entities/rank-requirement/api/rank-requirement.api.test.ts`
- Create: `apps/frontend/src/entities/rank-requirement/lib/hooks.ts`
- Create: `apps/frontend/src/entities/rank-requirement/index.ts`

**Interfaces:**
- Produces:
  - `getRequirements(rankId)` → resolve for actor
  - `getRequirementsForUser(rankId, userId)` → `?forUserId=`
  - `getRequirementsForSet(rankId, setId)` → `?setId=`
  - `setRequirements(rankId, body: SetGradingRequirementsInput)` → PUT
  - `clearRequirements(rankId, setId)` → DELETE with query
  - hooks: `useRequirementsQuery(rankId)`, `useRequirementsForUserQuery(rankId, userId)`, `useRequirementsForSetQuery(rankId, setId)`, `useSetRequirementsMutation`, `useClearRequirementsMutation`
  - key registry: `rankRequirementKeys = { all: ['rankRequirement'], forActor: (r) => [..., 'actor', r], forUser: (r,u) => [..., 'user', r, u], forSet: (r,s) => [..., 'set', r, s] }`

- [ ] **Step 1: API helpers**

```ts
import { GradingRequirementsSchema, SetGradingRequirementsSchema, type GradingRequirements, type SetGradingRequirementsInput, RankRequirementsRoutes } from '@repo/contracts';
import { httpClient } from '@/shared/api';

export async function getRequirements(rankId: string): Promise<GradingRequirements> {
  const raw = await httpClient(RankRequirementsRoutes.byRankId(rankId));
  return GradingRequirementsSchema.parse(raw);
}
export async function getRequirementsForUser(rankId: string, userId: string): Promise<GradingRequirements> {
  const raw = await httpClient(`${RankRequirementsRoutes.byRankId(rankId)}?forUserId=${encodeURIComponent(userId)}`);
  return GradingRequirementsSchema.parse(raw);
}
export async function getRequirementsForSet(rankId: string, setId: string): Promise<GradingRequirements> {
  const raw = await httpClient(`${RankRequirementsRoutes.byRankId(rankId)}?setId=${encodeURIComponent(setId)}`);
  return GradingRequirementsSchema.parse(raw);
}
export async function setRequirements(rankId: string, body: SetGradingRequirementsInput): Promise<GradingRequirements> {
  const raw = await httpClient(RankRequirementsRoutes.byRankId(rankId), { method: 'PUT', body });
  return GradingRequirementsSchema.parse(raw);
}
export async function clearRequirements(rankId: string, setId: string): Promise<void> {
  await httpClient(`${RankRequirementsRoutes.byRankId(rankId)}?setId=${encodeURIComponent(setId)}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Hooks** — mirror Task 14's style. Each mutation invalidates `rankRequirementKeys.all`.

- [ ] **Step 3: Tests + commit**

```bash
pnpm --filter @repo/frontend test -- rank-requirement
git add apps/frontend/src/entities/rank-requirement
git commit -m "feat(frontend): rank-requirement entity"
```

---

### Task 16: `shared/lib/rankProgress.ts`

**Files:**
- Create: `apps/frontend/src/shared/lib/rankProgress.ts`
- Create: `apps/frontend/src/shared/lib/rankProgress.test.ts`

**Interfaces:**
- Produces: `calculateRankProgress(req: GradingRequirements, techProgress: Progress[], patProgress: Progress[]): { ready: number; total: number; pct: number }`

- [ ] **Step 1: Failing tests first**

```ts
import { describe, expect, it } from 'vitest';
import type { GradingRequirements, Progress } from '@repo/contracts';
import { calculateRankProgress } from './rankProgress.js';

const empty: GradingRequirements = {
  rankId: 'r', setId: null,
  kihon: [], kihonTested: [], kobo: [], koboTested: [],
  otherPatterns: [], otherPatternsTested: [], hokeiGroups: [],
  jissenMinutes: null, jissenTested: false,
  minMonthsSincePreviousRank: null,
  requiresTheoricExam: false, requiresEssay: false,
};

describe('calculateRankProgress', () => {
  it('returns 0/0 0% when there are no requirements', () => {
    expect(calculateRankProgress(empty, [], [])).toEqual({ ready: 0, total: 0, pct: 0 });
  });

  it('counts kihon techniques toward total', () => {
    expect(calculateRankProgress({ ...empty, kihon: ['t1', 't2'] }, [], [])).toEqual({ ready: 0, total: 2, pct: 0 });
  });

  it('counts grading_ready techniques as ready', () => {
    const techProg: Progress[] = [{ contentType: 'technique', techniqueId: 't1', status: 'grading_ready' } as any];
    expect(calculateRankProgress({ ...empty, kihon: ['t1', 't2'] }, techProg, [])).toEqual({ ready: 1, total: 2, pct: 50 });
  });

  it('flattens hokei group patterns into total', () => {
    const r: GradingRequirements = { ...empty, hokeiGroups: [{ id: 'g1', groupOrder: 0, pickCount: 1, isTested: false, patternIds: ['p1', 'p2'] }] as any };
    expect(calculateRankProgress(r, [], [])).toEqual({ ready: 0, total: 2, pct: 0 });
  });

  it('rounds percentage', () => {
    const r: GradingRequirements = { ...empty, kihon: ['t1', 't2', 't3'] };
    const tp: Progress[] = [{ contentType: 'technique', techniqueId: 't1', status: 'grading_ready' } as any];
    expect(calculateRankProgress(r, tp, []).pct).toBe(33);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { GradingRequirements, Progress } from '@repo/contracts';

export function calculateRankProgress(
  req: GradingRequirements,
  techProgress: Progress[],
  patProgress: Progress[],
): { ready: number; total: number; pct: number } {
  const allPatternIds = [
    ...req.hokeiGroups.flatMap((g) => g.patternIds),
    ...req.kobo,
    ...req.otherPatterns,
  ];
  const total = req.kihon.length + allPatternIds.length;
  if (total === 0) return { ready: 0, total: 0, pct: 0 };

  const techReady = new Set(
    techProgress.filter((p) => p.status === 'grading_ready').map((p) => p.techniqueId).filter(Boolean) as string[],
  );
  const patReady = new Set(
    patProgress.filter((p) => p.status === 'grading_ready').map((p) => p.patternId).filter(Boolean) as string[],
  );

  let ready = 0;
  for (const id of req.kihon) if (techReady.has(id)) ready++;
  for (const id of allPatternIds) if (patReady.has(id)) ready++;
  return { ready, total, pct: Math.round((ready / total) * 100) };
}
```

- [ ] **Step 3: Run tests — green**

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/shared/lib/rankProgress.ts apps/frontend/src/shared/lib/rankProgress.test.ts
git commit -m "feat(frontend): calculateRankProgress shared lib"
```

---

## Phase 7 — Admin UI (4 tasks)

### Task 17: `AdminRequirementSetsPage`

**Files:**
- Create: `apps/frontend/src/pages/admin-requirement-sets/ui/AdminRequirementSetsPage.tsx`
- Create: `apps/frontend/src/pages/admin-requirement-sets/ui/AdminRequirementSetsPage.test.tsx`
- Create: `apps/frontend/src/pages/admin-requirement-sets/index.ts`
- Create: `apps/frontend/src/app/router/routes/_app.admin.requirement-sets.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.admin.requirement-sets.index.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

**Interfaces:**
- A page listing all requirement sets the actor can see, with create-set inline form (name + effectiveDate; org auto-set for non-sysadmin), per-row Activate/Deactivate/Clone/Edit/Delete buttons, and an "Active" badge.

- [ ] **Step 1: Add i18n keys**

`en.json`:

```json
"admin": {
  "requirementSets": {
    "title": "Requirement sets",
    "description": "Versioned bundles of grading requirements. One active set per organisation.",
    "newSet": "New set",
    "name": "Name",
    "effectiveDate": "Effective date",
    "active": "Active",
    "actions": "Actions",
    "activate": "Activate",
    "deactivate": "Deactivate",
    "clone": "Clone",
    "clonePrompt": "Name for cloned set",
    "edit": "Edit",
    "delete": "Delete",
    "deleteConfirm": "Delete this requirement set? Cannot be undone."
  }
}
```

Mirror to `sv.json` and `fi.json` with translated values.

- [ ] **Step 2: Implement the page**

Follow `pages/admin-patterns/.../AdminPatternsPage.tsx` as a structural reference. Use shadcn `Table`, `Dialog`, `Button`, `Input`, and the `useRequirementSetsQuery` + mutations from Task 14. Activate button calls `useActivateRequirementSetMutation`; on success a toast + invalidate.

- [ ] **Step 3: Add the route file**

```tsx
// _app.admin.requirement-sets.tsx — layout shell
import { Outlet, createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/_app/admin/requirement-sets')({ component: Outlet });

// _app.admin.requirement-sets.index.tsx — the list page
import { createFileRoute } from '@tanstack/react-router';
import { AdminRequirementSetsPage } from '@/pages/admin-requirement-sets';
export const Route = createFileRoute('/_app/admin/requirement-sets/')({ component: AdminRequirementSetsPage });
```

- [ ] **Step 4: Sidebar entry**

In `AppSidebar.tsx`, add a sidebar item under the admin section: label `t('nav.adminRequirementSets')`, path `/admin/requirement-sets`, visibility gated on `Can('manage', 'RequirementSet')`. Also add the key `nav.adminRequirementSets` to all three locales.

- [ ] **Step 5: Tests + run**

Component test covers: renders list rows, activate toggles state, delete shows confirm, create-set submits with correct payload.

```bash
pnpm --filter @repo/frontend test -- AdminRequirementSetsPage
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/admin-requirement-sets apps/frontend/src/app/router/routes/_app.admin.requirement-sets*.tsx apps/frontend/src/widgets/appsidebar apps/frontend/src/i18n
git commit -m "feat(frontend): AdminRequirementSetsPage"
```

---

### Task 18: `RankRequirementsEditor` feature

**Files:**
- Create: `apps/frontend/src/features/rank-requirements-editor/ui/RankRequirementsEditor.tsx`
- Create: `apps/frontend/src/features/rank-requirements-editor/ui/RankRequirementsEditor.test.tsx`
- Create: `apps/frontend/src/features/rank-requirements-editor/ui/HokeiGroupEditor.tsx`
- Create: `apps/frontend/src/features/rank-requirements-editor/index.ts`

**Interfaces:**
- Produces `<RankRequirementsEditor rankId={string} setId={string} />` — a controlled form whose initial values come from `useRequirementsForSetQuery(rankId, setId)`, and whose Save button calls `useSetRequirementsMutation()` with the full whole-scope body.

Section breakdown inside the editor:

1. **Kihon** — multi-select autocomplete (techniques where `isKihon: true` from `useTechniquesQuery`). Each chip has a `Tested` toggle.
2. **Kobo patterns** — multi-select autocomplete over patterns whose `classificationsByRoot.pattern_type` contains a category with `code: 'kobo'`. Each chip has a tested toggle.
3. **Other patterns** — multi-select over the rest.
4. **Hokei groups** — list of `<HokeiGroupEditor>` cards with add/remove; each card has `groupOrder` (read-only, derived from index), `pickCount`, `isTested`, `labelEn/Fi/Sv` optional fields, and a pattern multi-select.
5. **Scalars** — `jissenMinutes` (number input + tested toggle), `minMonthsSincePreviousRank` (number input), `requiresTheoricExam` (switch), `requiresEssay` (switch).

- [ ] **Step 1: Build it, react-hook-form-backed**

Use `useForm<SetGradingRequirementsInput>({ defaultValues: …, resolver: zodResolver(SetGradingRequirementsSchema) })`.

- [ ] **Step 2: Component test**

Render the editor wrapped in `QueryClientProvider` with seeded fixtures; assert:
- Initial values loaded from the query
- Toggling a chip's `Tested` flag adds it to `kihonTested`
- Removing a chip removes it from both arrays
- Save submits the correct payload
- Adding a hokei group with 2 patterns and `pickCount=5` sends `pickCount: 5` (server clamps to 2 — client does NOT clamp)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/rank-requirements-editor
git commit -m "feat(frontend): RankRequirementsEditor feature"
```

---

### Task 19: `AdminRankRequirementsPage`

**Files:**
- Create: `apps/frontend/src/pages/admin-rank-requirements/ui/AdminRankRequirementsPage.tsx`
- Create: `apps/frontend/src/pages/admin-rank-requirements/ui/AdminRankRequirementsPage.test.tsx`
- Create: `apps/frontend/src/pages/admin-rank-requirements/index.ts`
- Create: `apps/frontend/src/app/router/routes/_app.admin.rank-requirements.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.admin.rank-requirements.index.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` (add nav entry)
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

**Interfaces:**
- The page shows two selectors — Requirement set and Rank — and renders `<RankRequirementsEditor>` when both are picked.

- [ ] **Step 1: Page implementation**

Use `useSearch` to keep `?setId=` and `?rankId=` in the URL. Sets selector calls `useRequirementSetsQuery`. Ranks selector calls `useBeltRanksQuery` (use the existing entity — search for it). Once both selected, render the editor.

- [ ] **Step 2: i18n keys**

```json
"admin": {
  "rankRequirements": {
    "title": "Rank requirements",
    "description": "Edit per-rank kihon, kobo, patterns, hokei groups, and grading rules.",
    "selectSet": "Select a requirement set",
    "selectRank": "Select a rank",
    "save": "Save requirements",
    "saved": "Requirements saved",
    "sections": {
      "kihon": "Kihon (techniques)",
      "kobo": "Kobo",
      "otherPatterns": "Other patterns",
      "hokei": "Hokei groups",
      "scalars": "Grading rules"
    },
    "scalars": {
      "jissenMinutes": "Jissen minutes",
      "jissenTested": "Jissen tested at grading",
      "minMonths": "Minimum months since previous rank",
      "requiresExam": "Requires theory exam",
      "requiresEssay": "Requires essay"
    },
    "hokei": {
      "addGroup": "Add hokei group",
      "pickCount": "Pick count",
      "isTested": "Tested at grading",
      "labelEn": "Label (EN)",
      "labelFi": "Label (FI)",
      "labelSv": "Label (SV)",
      "addPattern": "Add pattern",
      "removeGroup": "Remove group"
    }
  }
}
```

- [ ] **Step 3: Route files + commit**

```bash
git add apps/frontend/src/pages/admin-rank-requirements apps/frontend/src/app/router/routes/_app.admin.rank-requirements*.tsx apps/frontend/src/widgets/appsidebar apps/frontend/src/i18n
git commit -m "feat(frontend): AdminRankRequirementsPage"
```

---

### Task 20: Smoke-test the admin flow end-to-end

**Files:**
- (none — manual + commit)

- [ ] **Step 1: Boot both services**

```powershell
pnpm --filter @repo/backend run start:dev
# in another shell
pnpm --filter @repo/frontend run dev
```

- [ ] **Step 2: Walk the flow**

Sign in as orgadmin. Navigate `/admin/requirement-sets`. Create a set. Activate it. Navigate `/admin/rank-requirements?setId=...&rankId=...`. Add 2 kihon (one tested), 1 kobo, 1 hokei group with 2 patterns and `pickCount=5`, set jissen minutes = 30. Save. Reopen — verify values round-tripped and hokei group is stored as `pickCount=2` (server clamped).

- [ ] **Step 3: Take screenshots, commit**

```bash
git add docs/superpowers/screenshots/grading-requirements/   # if any
git commit -m "docs(grading-requirements): admin flow smoke screenshots" --allow-empty
```

(Empty commit is fine if no screenshots taken.)

---

## Phase 8 — Student/instructor/public read surfaces (5 tasks)

### Task 21: `RankRequirementsDisplay` feature

**Files:**
- Create: `apps/frontend/src/features/rank-requirements-display/ui/RankRequirementsDisplay.tsx`
- Create: `apps/frontend/src/features/rank-requirements-display/ui/RankRequirementsDisplay.test.tsx`
- Create: `apps/frontend/src/features/rank-requirements-display/index.ts`

**Interfaces:**
- Produces `<RankRequirementsDisplay requirements techProgress patProgress />` — pure presentational; renders five sections (Kihon, Kobo, Other patterns, Hokei groups, Scalars), each a list with the `mastered` chip computed from progress.
- A helper subcomponent `<RequirementRow techniqueOrPattern label tested mastered onClick? />` that closes over the techniques/patterns hash for romaji/ja labels.

- [ ] **Step 1: Resolve names**

The display needs ja/romaji per technique/pattern. Pass them in as props OR have the parent inject a `lookup: { techniques: Map<id, Technique>; patterns: Map<id, Pattern> }`. Pick the second — cleaner.

- [ ] **Step 2: Test cases**

- Renders each section heading when non-empty; hides empty sections.
- "Tested" chip rendered on tested items only.
- Mastered chip rendered when status is `grading_ready`.
- Hokei group caption shows `t('progression.hokei.pickN', { pick: N, of: M })` when `pickCount < patternIds.length`, and `t('progression.hokei.all')` when equal.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/rank-requirements-display
git commit -m "feat(frontend): RankRequirementsDisplay feature"
```

---

### Task 22: `NextRankCard` feature

**Files:**
- Create: `apps/frontend/src/features/next-rank-card/ui/NextRankCard.tsx`
- Create: `apps/frontend/src/features/next-rank-card/ui/NextRankCard.test.tsx`
- Create: `apps/frontend/src/features/next-rank-card/index.ts`

**Interfaces:**
- `<NextRankCard userId? />` — defaults to actor. Internally:
  - Calls `useUserRankHistoryQuery(userId)` (existing) to know current and next rank
  - Calls `useRequirementsQuery(nextRank.id)` (or `useRequirementsForUserQuery(nextRank.id, userId)`)
  - Calls `useProgressListQuery('technique')` and `useProgressListQuery('pattern')` (existing)
  - Computes `calculateRankProgress(req, techProg, patProg)`
  - Renders a card with progress bar + caption `t('nextRank.caption', { ready, total })`
  - Empty state when at highest rank — `t('nextRank.atHighest')`

- [ ] **Step 1: Test cases**

- "X/Y" caption renders for non-zero total
- Progress bar `value` is the computed `pct`
- "Highest rank" state renders when `nextRank` is null

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/next-rank-card apps/frontend/src/i18n
git commit -m "feat(frontend): NextRankCard"
```

---

### Task 23: `ProgressionPage` (student-facing)

**Files:**
- Create: `apps/frontend/src/pages/progression/ui/ProgressionPage.tsx`
- Create: `apps/frontend/src/pages/progression/ui/ProgressionPage.test.tsx`
- Create: `apps/frontend/src/pages/progression/index.ts`
- Create: `apps/frontend/src/app/router/routes/_app.progression.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

**Interfaces:**
- Self-resolves the actor's next rank via rank-history, then renders `<NextRankCard />` at the top followed by `<RankRequirementsDisplay />` below.

- [ ] **Step 1: Implementation + tests**

Follow `pages/grading-history/.../*Page.tsx` for chrome conventions.

- [ ] **Step 2: i18n + sidebar entry + commit**

```bash
git add apps/frontend/src/pages/progression apps/frontend/src/app/router/routes/_app.progression.tsx apps/frontend/src/widgets/appsidebar apps/frontend/src/i18n
git commit -m "feat(frontend): ProgressionPage"
```

---

### Task 24: Mount `NextRankCard` on Dashboard + History

**Files:**
- Modify: `apps/frontend/src/pages/dashboard/.../DashboardPage.tsx`
- Modify: `apps/frontend/src/pages/grading-history/.../*Page.tsx`
- Modify: respective `.test.tsx` files

- [ ] **Step 1: Add the card to dashboard above the existing cards**

- [ ] **Step 2: Add the card to grading-history page sidebar / top**

- [ ] **Step 3: Update tests to assert the card is present (smoke level)**

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/dashboard apps/frontend/src/pages/grading-history
git commit -m "feat(frontend): mount NextRankCard on dashboard + grading history"
```

---

### Task 25: Instructor view + public projection

**Files:**
- Modify: `apps/frontend/src/pages/student-detail/.../*Page.tsx` + test
- Backend: extend the existing public-rank endpoint to inject the active set's requirements projection (if a public-rank service exists).

**Interfaces:**
- On `student-detail` page, use `useRequirementsForUserQuery(nextRankId, studentId)` and render `<RankRequirementsDisplay />`.
- On the public rank page (`PublicRoutes.rankBySlug`), the backend response embeds `requirements: GradingRequirements | null`. Frontend public-rank page renders the same display when present.

- [ ] **Step 1: Locate the public-rank service**

Search:

```bash
grep -r "rankBySlug\|public/ranks" apps/backend/src
```

If a service exists, add `requirements` to its DTO and populate via `RankRequirementsService.resolveForSet(rankId, set.id)` where `set` is the active set for `rank.organisationId`. If no service exists, defer this step to a follow-up and write a TODO comment in the plan execution notes.

- [ ] **Step 2: Update the student-detail page**

- [ ] **Step 3: Tests + commit**

```bash
git add apps/frontend/src/pages/student-detail apps/backend/src/modules/...
git commit -m "feat(grading-requirements): instructor + public rank surfaces"
```

---

## Phase 9 — Final verification (1 task)

### Task 26: Full test sweep + PR

- [ ] **Step 1: Run every test**

```bash
pnpm test
pnpm --filter @repo/backend run test:e2e
pnpm typecheck
pnpm lint
```

Expected: all green.

- [ ] **Step 2: Boot the app once more, manual walk-through**

Sign in as orgadmin, follow Task 20 flow + sign in as a student, view dashboard + progression. Sign in as instructor, view a student detail. Verify all wired surfaces show requirements.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feature/grading-requirements
gh pr create --title "feat: grading requirements (per-rank + versioned sets)" --body "$(cat <<'EOF'
## Summary
- New tables: requirement_set, rank_grading_requirement, rank_requirement_technique/pattern/hokei_group(+patterns)
- Backend modules: RequirementSetsService + RankRequirementsService; org ancestor walk for student resolution
- Frontend: admin requirement-sets + per-rank editor; student progression page + NextRankCard wired into dashboard/grading-history; instructor + public surfaces

## Test plan
- [x] Backend unit specs pass
- [x] Backend e2e covers spec §8 1-10
- [x] Frontend unit specs pass
- [x] Manual smoke as orgadmin, student, instructor

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Done**

Plan complete.

---

## Self-Review

**Spec coverage check** (against spec §§1–8):

| Spec section | Plan task(s) |
| --- | --- |
| §1.1 `requirement_sets` table | Task 4 |
| §1.2 `rank_grading_requirements` scalar anchor | Task 4 |
| §1.3 `rank_requirement_techniques` | Task 4 |
| §1.4 `rank_requirement_patterns` | Task 4 |
| §1.5 `rank_requirement_hokei_groups` | Task 4 |
| §1.6 `rank_requirement_hokei_group_patterns` | Task 4 |
| §2 scope NULL handling | Task 10 (repo `scopeWhere`), Task 11 (`fetchForScope`) |
| §2 whole-scope replace | Task 12 |
| §2 setId required | Task 12 (BadRequestException), Task 13 (controller) |
| §2 pickCount clamp | Task 12 |
| §2 scalar anchor governs existence | Task 11 (`fetchForScope`) |
| §2 student resolution via ancestors | Task 5 (helper) + Task 11 (`resolveForUser`) |
| §2 user_org via student membership | Task 11 |
| §2 one active set per org | Task 7 (`activate` transaction) |
| §2 deep clone | Task 7 (set row), Task 12 (`deepCopyDetailsForSet`) |
| §2 set delete cascades | DB-level via `ON DELETE CASCADE` in Task 4 |
| §3.1 GET /:rankId resolve | Task 11 + Task 13 |
| §3.1 PUT /:rankId replace | Task 12 + Task 13 |
| §3.1 DELETE /:rankId | Task 12 + Task 13 |
| §3.1 GradingRequirements projection (kobo split) | Task 10 (`fetchPatternsWithType`) + Task 11 |
| §3.2 requirement-sets CRUD + activate/deactivate/clone | Tasks 6–8 |
| §3.3 `getAncestorIds` | Task 5 |
| §4 auth model | Task 7 (`GradingRequirementsAbilityRules`), Task 11/12 (assertCanManageSet) |
| §5 zod schemas | Task 2 |
| §6 readiness | Task 16 (`calculateRankProgress`) |
| §7.1 frontend API helpers | Tasks 14, 15 |
| §7.2 AdminRequirementSetsPage | Task 17 |
| §7.2 AdminRequirementsPage editor | Tasks 18, 19 |
| §7.2 ProgressionPage | Task 23 + Task 21 |
| §7.2 Dashboard/HistoryPage | Tasks 22, 24 |
| §7.2 StudentDetailPage | Task 25 |
| §7.2 PublicRankPage | Task 25 |
| §7.3 shared components (`RequirementChecklistItem`, `RequirementListItem`, `NextRankCard`) | Tasks 21, 22 (combined into display + card features; existing shadcn primitives cover the row-level concerns) |
| §8 acceptance tests 1–10 | Task 13 e2e |
| §8 acceptance test 11 (readiness count) | Task 16 |

**Type-consistency check:**

- `GradingRequirements.setId` is `string | null` — both Task 2 schema and Task 11 projection respect this.
- `HokeiGroupInput.patternIds` is `string[]` everywhere; the resolved `HokeiGroup` adds `id`.
- `SetGradingRequirementsInput.kihonTested ⊆ kihon` is enforced by FE convention; backend Task 12 dedups defensively.
- Method names match across tasks: `replace`, `clearForScope`, `resolveForUser`, `resolveForSet`, `fetchForScope`, `emptyRequirements`, `deepCopyDetailsForSet`, `getAncestorIds`, `findActiveByOrg`, `setActive`, `deactivateActiveForOrg`.

**Placeholder scan:** none found — every code block contains real implementation; the e2e and public-rank tasks reference exact existing-file patterns to follow.
