# Techniques (Phase 3 — Progress tracking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-user progress tracking against techniques + patterns. Single polymorphic `user_content_progress` table; 4-state status enum; status pill on every catalogue row clickable to open an editor dialog.

**Architecture:** New `user_content_progress` table with `(content_type, technique_id, pattern_id)` discriminator + nullable FKs, polymorphic-FK CHECK, partial unique indexes for one-row-per-user-per-content. Backend `ProgressModule` with self-scoped list + per-content-type PUT/GET/DELETE. Frontend gets `entities/progress`, a `ProgressPill` shared primitive, a `ProgressEditorDialog` feature, plus wiring into all four catalogue pages.

**Tech Stack:** NestJS 11 · Drizzle ORM 0.45.2 + Postgres 15 · Zod 4.4.3 · CASL 6 · React 19 + TanStack Router + TanStack Query · shadcn primitives.

**Spec:** `docs/superpowers/specs/2026-06-11-techniques-phase3-progress-design.md` (commit `bbc7367`)

**Phase 1 baseline:** Techniques + classification taxonomy at commit `9414339`.
**Phase 2 baseline:** Patterns at commit `1f5496c`.

---

## File Map

**Created:**
- `apps/backend/drizzle/0021_*.sql` (auto-generated + hand-edited for CHECK + partial unique indexes)
- `apps/backend/src/infrastructure/database/schema/user-content-progress.ts`
- `apps/backend/src/modules/progress/progress.repository.ts`
- `apps/backend/src/modules/progress/progress.service.ts`
- `apps/backend/src/modules/progress/progress.service.spec.ts`
- `apps/backend/src/modules/progress/progress.controller.ts`
- `apps/backend/src/modules/progress/progress.module.ts`
- `apps/backend/src/modules/progress/progress.ability-rules.ts`
- `apps/backend/src/modules/progress/progress.ability-rules.spec.ts`
- `packages/contracts/src/progress.ts`
- `apps/frontend/src/entities/progress/api/progress.api.ts`
- `apps/frontend/src/entities/progress/api/progress.api.test.ts`
- `apps/frontend/src/entities/progress/lib/hooks.ts`
- `apps/frontend/src/entities/progress/index.ts`
- `apps/frontend/src/shared/ui/progress-pill.tsx`
- `apps/frontend/src/shared/ui/progress-pill.test.tsx`
- `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.tsx`
- `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.test.tsx`
- `apps/frontend/src/features/progress-editor-dialog/index.ts`

**Modified:**
- `apps/backend/src/infrastructure/database/schema/index.ts` (re-export progress)
- `apps/backend/src/app.module.ts` (register `ProgressModule`)
- `apps/backend/src/infrastructure/ability/ability.factory.ts` (`@Optional` inject `ProgressAbilityRules`)
- `apps/backend/src/infrastructure/ability/ability.module.ts` (register `ProgressAbilityRules`)
- `packages/contracts/src/casl.ts` (`Progress` subject + shape)
- `packages/contracts/src/index.ts` (re-export `progress`)
- `packages/contracts/src/openapi.ts` (register `ProgressOpenApiRegistry`)
- `packages/contracts/tsup.config.ts` + `package.json` (`./progress` entry)
- `packages/contracts/openapi/openapi.{yaml,json}` (regenerated)
- `apps/frontend/src/shared/ui/index.ts` (export `ProgressPill`)
- `apps/frontend/src/pages/techniques/ui/TechniquesPage.tsx` (render pill per row + mount dialog)
- `apps/frontend/src/pages/admin-techniques/ui/AdminTechniquesPage.tsx` (same)
- `apps/frontend/src/pages/patterns/ui/PatternsPage.tsx` (same)
- `apps/frontend/src/pages/admin-patterns/ui/AdminPatternsPage.tsx` (same)
- `apps/frontend/src/i18n/locales/{en,sv,fi}.json` (`progress.*` block)

---

## Task 1: DB — `user_content_progress` schema + migration 0021

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/user-content-progress.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Create: `apps/backend/drizzle/0021_*.sql` (auto-generated, hand-edited for CHECK + partial unique indexes)

## Step 0: Recon

Phase 1's `audit-log.ts` schema is the closest reference for a table with multiple optional FKs. Read it. Phase 2's `pattern.ts` is the closest reference for FK styles + index naming. Read it.

- Note: `user.id` is `text`, all other entity ids are `uuid`. The progress table's `user_id` therefore matches `text`; `technique_id` and `pattern_id` are `uuid`.

## Step 1: Schema

```ts
// user-content-progress.ts
import { check, date, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { pattern } from './pattern.js';
import { technique } from './technique.js';
import { user } from './users.js';

export const userContentProgress = pgTable(
  'user_content_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    techniqueId: uuid('technique_id').references(() => technique.id, { onDelete: 'cascade' }),
    patternId: uuid('pattern_id').references(() => pattern.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    notes: text('notes').notNull().default(''),
    lastPracticedAt: date('last_practiced_at'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('user_content_progress_user_idx').on(table.userId),
    polymorphicCheck: check(
      'user_content_progress_polymorphic_check',
      sql`(${table.contentType} = 'technique' AND ${table.techniqueId} IS NOT NULL AND ${table.patternId} IS NULL)
       OR (${table.contentType} = 'pattern' AND ${table.patternId} IS NOT NULL AND ${table.techniqueId} IS NULL)`,
    ),
    statusCheck: check(
      'user_content_progress_status_check',
      sql`${table.status} IN ('not_started', 'learning', 'competent', 'grading_ready')`,
    ),
    // Partial unique indexes — one progress row per user per content item. Drizzle's
    // uniqueIndex() supports a where() clause for partial indexes.
    userTechniqueUniq: uniqueIndex('user_content_progress_user_technique_uniq')
      .on(table.userId, table.techniqueId)
      .where(sql`${table.techniqueId} IS NOT NULL`),
    userPatternUniq: uniqueIndex('user_content_progress_user_pattern_uniq')
      .on(table.userId, table.patternId)
      .where(sql`${table.patternId} IS NOT NULL`),
  }),
);

export type DbUserContentProgress = typeof userContentProgress.$inferSelect;
export type DbNewUserContentProgress = typeof userContentProgress.$inferInsert;
```

**Note:** Drizzle 0.45's `uniqueIndex().where()` for partial indexes may or may not generate the `WHERE` clause in the migration SQL — if drizzle-kit emits it without the `WHERE`, hand-edit the generated SQL to add it. The SQL fragment is:

```sql
CREATE UNIQUE INDEX "user_content_progress_user_technique_uniq"
  ON "user_content_progress" ("user_id", "technique_id")
  WHERE "technique_id" IS NOT NULL;
```

Likewise for `_user_pattern_uniq`.

Similarly, the `check()` helper may not exist in drizzle 0.45 (it landed in later versions). If it's not exported from `drizzle-orm/pg-core`, fall back to hand-editing the migration SQL to add the CHECK constraints:

```sql
ALTER TABLE "user_content_progress"
  ADD CONSTRAINT "user_content_progress_polymorphic_check"
  CHECK (...);
ALTER TABLE "user_content_progress"
  ADD CONSTRAINT "user_content_progress_status_check"
  CHECK (status IN ('not_started','learning','competent','grading_ready'));
```

If `check()` is unavailable, drop the `polymorphicCheck` and `statusCheck` keys from the schema callback and append the ALTER statements to the generated SQL.

## Step 2: Schema barrel

Append to `apps/backend/src/infrastructure/database/schema/index.ts`:

```ts
export * from './user-content-progress.js';
```

## Step 3: Generate migration

```
cd apps/backend && npx drizzle-kit generate
```

Verify the emitted SQL:
- `CREATE TABLE user_content_progress` with `id`, `user_id`, `content_type`, `technique_id`, `pattern_id`, `status`, `notes`, `last_practiced_at`, `created_at`, `updated_at`.
- FK constraints to `user`, `technique`, `pattern`.
- `user_content_progress_user_idx` index on `user_id`.
- Partial unique indexes on `(user_id, technique_id)` WHERE `technique_id IS NOT NULL` and `(user_id, pattern_id)` WHERE `pattern_id IS NOT NULL`. If the `WHERE` clause is missing, hand-add it.
- Polymorphic + status CHECK constraints. If drizzle-kit didn't emit them (the `check()` helper may be unavailable), hand-add the ALTER TABLE statements.

## Step 4: Apply locally

```
pnpm --filter backend run db:migrate
```

Expected: applies cleanly. Sanity-check (psql, optional):

```sql
\d user_content_progress
```

Should show: 10 columns, 2 partial unique indexes, 1 `(user_id)` index, 2 CHECK constraints.

## Step 5: Typecheck + tests

```
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: 327/327 still pass (no behaviour change yet); typecheck clean.

## Step 6: Commit

```
git add apps/backend/src/infrastructure/database/schema/user-content-progress.ts \
        apps/backend/src/infrastructure/database/schema/index.ts \
        apps/backend/drizzle/0021_*.sql \
        apps/backend/drizzle/meta/
git commit -m "feat(db): user_content_progress + polymorphic CHECK + partial unique indexes (migration 0021)"
```

---

## Task 2: Contracts — `progress` schemas + CASL `Progress` subject

**Files:**
- Create: `packages/contracts/src/progress.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/openapi.ts`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/package.json`

Mirror Phase 1's `techniques.ts` style (`059cbf8`) — `.meta({ id, description, example })` for OpenAPI.

## Step 0: Recon

1. Read `packages/contracts/src/techniques.ts` for the schema + registry + import-style reference.
2. Read `packages/contracts/src/casl.ts` to see where Pattern/Technique subjects sit. Add Progress alongside.
3. Read `packages/contracts/src/openapi.ts` for the registry-wiring pattern (Tasks 7 of Phase 1 + Phase 2 mirrored this).
4. Read `packages/contracts/tsup.config.ts` + `package.json` `exports` map — both have entries for `techniques` and `patterns` to mirror.

## Step 1: progress.ts

```ts
import { z } from 'zod';

export const PROGRESS_STATUSES = ['not_started', 'learning', 'competent', 'grading_ready'] as const;
export const ProgressStatusSchema = z.enum(PROGRESS_STATUSES);
export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

export const CONTENT_TYPES = ['technique', 'pattern'] as const;
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof ContentTypeSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  contentType: ContentTypeSchema,
  techniqueId: z.string().uuid().nullable(),
  patternId: z.string().uuid().nullable(),
  status: ProgressStatusSchema,
  notes: z.string(),
  lastPracticedAt: IsoDate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({
  id: 'Progress',
  description: 'Per-user progress on a single technique or pattern.',
  example: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-abc',
    contentType: 'technique',
    techniqueId: '550e8400-e29b-41d4-a716-446655440001',
    patternId: null,
    status: 'learning',
    notes: '',
    lastPracticedAt: '2026-06-11',
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  },
});

export const UpsertProgressSchema = z.object({
  status: ProgressStatusSchema,
  notes: z.string().max(2000).default(''),
  lastPracticedAt: IsoDate.nullable().optional(),
}).meta({
  id: 'UpsertProgressInput',
  description: 'Body for PUT /api/progress/{contentType}/:id. Notes default to empty string. lastPracticedAt is optional.',
});

export type Progress = z.infer<typeof ProgressSchema>;
export type UpsertProgressInput = z.infer<typeof UpsertProgressSchema>;

export const ProgressOpenApiRegistry = {
  Progress: ProgressSchema,
  UpsertProgressInput: UpsertProgressSchema,
} as const;
```

## Step 2: CASL — `Progress` subject

In `packages/contracts/src/casl.ts`:

1. Add `'Progress'` to `SubjectSchema` enum BEFORE `'all'`.
2. Add `PatternSubjectShape`-style type:
   ```ts
   export type ProgressSubjectShape = {
     readonly __caslSubjectType__: 'Progress';
     /** Scopes regular users to their own rows. */
     userId?: string;
   };
   ```
3. Add to the `AppSubject` union.

## Step 3: Re-export

```ts
// packages/contracts/src/index.ts
export * from './progress.js';
```

## Step 4: Register in openapi.ts

Read `packages/contracts/src/openapi.ts` and mirror the wiring of `PatternOpenApiRegistry` (Phase 2 Task 4 added it).

## Step 5: tsup + package.json

Mirror Phase 2's pattern:

```ts
// tsup.config.ts — append 'src/progress.ts' to entry
```

```json
// package.json — add ./progress entry mirroring ./patterns shape (with require/cjs)
"./progress": {
  "import": "./dist/progress.js",
  "require": "./dist/progress.cjs",
  "types": "./dist/progress.d.ts"
}
```

## Step 6: Verify

```
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
pnpm --filter @repo/contracts build
```

Expected: typecheck clean, 173/173 tests pass, build emits `dist/progress.js` + `.cjs` + types.

## Step 7: Commit

```
git add packages/contracts/src/progress.ts \
        packages/contracts/src/casl.ts \
        packages/contracts/src/index.ts \
        packages/contracts/src/openapi.ts \
        packages/contracts/tsup.config.ts \
        packages/contracts/package.json
git commit -m "feat(contracts): Progress schemas + CASL subject"
```

---

## Task 3: Backend — `ProgressModule` (repo + service + controller + ability + spec)

**Files (all new):**
- `apps/backend/src/modules/progress/progress.repository.ts`
- `apps/backend/src/modules/progress/progress.service.ts`
- `apps/backend/src/modules/progress/progress.service.spec.ts`
- `apps/backend/src/modules/progress/progress.controller.ts`
- `apps/backend/src/modules/progress/progress.module.ts`
- `apps/backend/src/modules/progress/progress.ability-rules.ts`
- `apps/backend/src/modules/progress/progress.ability-rules.spec.ts`

## Step 0: Recon

1. Phase 2 `PatternModule` (commit `fb668d1`) — closest reference for service, controller, ability shape.
2. Phase 1 `TechniqueModule` — secondary reference.
3. `apps/backend/src/infrastructure/database/schema/user-content-progress.ts` (Task 1) — table shape.
4. `packages/contracts/src/progress.ts` (Task 2) — types.

## Step 1: Repository

```ts
@Injectable()
export class ProgressRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Find one row by (user_id, technique_id) or (user_id, pattern_id). */
  async findByUserAndContent(
    userId: string,
    contentType: ContentType,
    contentId: string,
    tx?: DrizzleExecutor,
  ): Promise<ProgressRow | null>;

  /** List all rows for the user, optionally filtered by content_type. */
  async listByUser(
    userId: string,
    contentType?: ContentType,
  ): Promise<ProgressRow[]>;

  /** Insert a brand-new row. Caller has verified absence. */
  async insert(input: NewProgressRow, tx: DrizzleExecutor): Promise<ProgressRow>;

  /** Patch an existing row. */
  async update(id: string, patch: Partial<ProgressRow>, tx: DrizzleExecutor): Promise<ProgressRow>;

  /** Delete by id. */
  async delete(id: string, tx: DrizzleExecutor): Promise<void>;
}
```

## Step 2: Service

```ts
@Injectable()
export class ProgressService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly repo: ProgressRepository,
    private readonly audit: AuditLogService,
    @Inject(DRIZZLE) ...,  // also fetch technique/pattern repos for existence checks
  ) {}

  async list(actor: AuthenticatedUser, contentType?: ContentType): Promise<Progress[]> {
    const rows = await this.repo.listByUser(actor.id, contentType);
    return rows.map(this.toApi);
  }

  async findOne(actor: AuthenticatedUser, contentType: ContentType, contentId: string): Promise<Progress> {
    const row = await this.repo.findByUserAndContent(actor.id, contentType, contentId);
    if (!row) {
      throw new NotFoundException({
        error: {
          code: 'NOT_FOUND',
          message: `No progress recorded for ${contentType} ${contentId}.`,
        },
      });
    }
    return this.toApi(row);
  }

  async upsert(
    actor: AuthenticatedUser,
    contentType: ContentType,
    contentId: string,
    input: UpsertProgressInput,
  ): Promise<Progress> {
    // Verify the content exists. Use the technique / pattern repository OR run a quick exists() query.
    await this.assertContentExists(contentType, contentId);

    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByUserAndContent(actor.id, contentType, contentId, tx);
      const row = existing
        ? await this.repo.update(existing.id, {
            status: input.status,
            notes: input.notes ?? '',
            lastPracticedAt: input.lastPracticedAt ?? null,
            updatedAt: new Date(),
          }, tx)
        : await this.repo.insert({
            userId: actor.id,
            contentType,
            techniqueId: contentType === 'technique' ? contentId : null,
            patternId:   contentType === 'pattern'   ? contentId : null,
            status: input.status,
            notes: input.notes ?? '',
            lastPracticedAt: input.lastPracticedAt ?? null,
          }, tx);

      await this.audit.record({
        tx,
        entityType: 'progress',
        entityId: row.id,
        action: existing ? 'update' : 'create',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        before: existing ? this.snapshot(existing) : null,
        after: this.snapshot(row),
      });

      return this.toApi(row);
    });
  }

  async delete(actor: AuthenticatedUser, contentType: ContentType, contentId: string): Promise<void> {
    const row = await this.repo.findByUserAndContent(actor.id, contentType, contentId);
    if (!row) {
      throw new NotFoundException({
        error: {
          code: 'NOT_FOUND',
          message: `No progress recorded for ${contentType} ${contentId}.`,
        },
      });
    }
    await this.db.transaction(async (tx) => {
      await this.repo.delete(row.id, tx);
      await this.audit.record({
        tx,
        entityType: 'progress',
        entityId: row.id,
        action: 'delete',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        before: this.snapshot(row),
        after: null,
      });
    });
  }

  private async assertContentExists(contentType: ContentType, contentId: string): Promise<void> {
    // Validate uuid then check the row exists in the matching table.
    // Throws 404 INVALID_CONTENT on miss.
    const exists = contentType === 'technique'
      ? await this.techniqueExists(contentId)
      : await this.patternExists(contentId);
    if (!exists) {
      throw new NotFoundException({
        error: {
          code: 'INVALID_CONTENT',
          message: `Unknown ${contentType} ${contentId}.`,
          details: { offendingId: contentId, contentType },
        },
      });
    }
  }
}
```

Implement `techniqueExists` / `patternExists` via a small inline `db.select().from(technique).where(eq(technique.id, id)).limit(1)` — or inject the repositories. Either approach works; pick whichever matches the existing pattern in the codebase.

## Step 3: Spec (8 cases)

Mirror the plan's spec §12.1:

```ts
describe('ProgressService.upsert', () => {
  it('creates a new row when none exists', async () => { ... });
  it('updates an existing row (same id, fresh updated_at)', async () => { ... });
  it('rejects unknown techniqueId with INVALID_CONTENT 404', async () => { ... });
});

describe('ProgressService.delete', () => {
  it('removes a row when present', async () => { ... });
  it('404s when absent', async () => { ... });
});

describe('ProgressService.list', () => {
  it('returns only the caller\'s rows', async () => { ... });
});

describe('CASL on Progress', () => {
  it('regular user can manage own row but not another user\'s', async () => { ... });
  it('sysadmin can manage any row', async () => { ... });
});
```

Use thin mocks for `ProgressRepository` + `AuditLogService` + the content-existence checks. Mirror `pattern.service.spec.ts`'s mock-builder style.

## Step 4: Controller

```ts
@Controller('progress')
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('contentType') contentType?: string,
  ): Promise<Progress[]> {
    const ct = contentType === 'technique' || contentType === 'pattern' ? contentType : undefined;
    return this.service.list(user, ct);
  }

  @Get('techniques/:id')
  getTechnique(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Progress> {
    return this.service.findOne(user, 'technique', id);
  }

  @Get('patterns/:id')
  getPattern(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Progress> {
    return this.service.findOne(user, 'pattern', id);
  }

  @Put('techniques/:id')
  upsertTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertProgressSchema)) body: UpsertProgressInput,
  ): Promise<Progress> {
    return this.service.upsert(user, 'technique', id, body);
  }

  @Put('patterns/:id')
  upsertPattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertProgressSchema)) body: UpsertProgressInput,
  ): Promise<Progress> {
    return this.service.upsert(user, 'pattern', id, body);
  }

  @Delete('techniques/:id')
  deleteTechnique(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.service.delete(user, 'technique', id);
  }

  @Delete('patterns/:id')
  deletePattern(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.service.delete(user, 'pattern', id);
  }
}
```

## Step 5: Ability rules + spec

```ts
@Injectable()
export class ProgressAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'Progress');
      return;
    }
    // Every authenticated user can manage their own rows. The conditional `userId`
    // filter means cross-user access is rejected.
    builder.can('manage', 'Progress', { userId: user.id });
  }
}
```

Spec (3 cases): sysadmin manages all; regular user gets conditional manage with `userId` rule; anonymous gets nothing.

## Step 6: Module

```ts
@Module({
  controllers: [ProgressController],
  providers: [ProgressRepository, ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
```

`AuditLogModule` is `@Global()`; no explicit import needed.

## Step 7: Verify + commit

```
pnpm --filter backend exec vitest run src/modules/progress
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: 8 service + 3 ability = 11 new tests passing. Total ~338 (327 + 11).

```
git add apps/backend/src/modules/progress/
git commit -m "feat(progress): repository + service + controller + ability + spec"
```

---

## Task 4: Backend — AppModule wiring + AbilityFactory + OpenAPI regen

**Files:**
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.factory.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Modified (regenerated): `packages/contracts/openapi/openapi.{yaml,json}`

Mirror Phase 2 Task 7's pattern (`b6e8d99`):

- [ ] **Step 1: AppModule.imports gets `ProgressModule`**

- [ ] **Step 2: AbilityFactory injects `@Optional() private readonly progressRules?: ProgressAbilityRules`** + appends to contributors list

- [ ] **Step 3: AbilityModule.providers list `ProgressAbilityRules`**

- [ ] **Step 4: Full backend suite + typecheck**

Expected: 338+ passing.

- [ ] **Step 5: Regenerate OpenAPI**

```
pnpm openapi:generate
```

Verify diff shows new paths `/api/progress`, `/api/progress/techniques/{id}`, `/api/progress/patterns/{id}` (3 path keys, 7 operations) + new schemas `Progress`, `UpsertProgressInput`.

If contracts dist is stale: `pnpm --filter @repo/contracts build` first.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/app.module.ts \
        apps/backend/src/infrastructure/ability/ \
        packages/contracts/openapi/
git commit -m "feat(backend): wire ProgressModule + regen OpenAPI"
```

---

## Task 5: Frontend — `entities/progress` API + hooks

**Files (all new):**
- `apps/frontend/src/entities/progress/api/progress.api.ts`
- `apps/frontend/src/entities/progress/api/progress.api.test.ts`
- `apps/frontend/src/entities/progress/lib/hooks.ts`
- `apps/frontend/src/entities/progress/index.ts`

Mirror Phase 2's `entities/pattern` (`a6b91aa`) shape; swap symbols.

## Step 1: API

```ts
import { z } from 'zod';
import {
  ProgressSchema,
  type Progress,
  type ContentType,
  type UpsertProgressInput,
} from '@repo/contracts/progress';
import { httpClient } from '@/shared/api';

const ListSchema = z.array(ProgressSchema);

export async function getProgressList(contentType?: ContentType): Promise<Progress[]> {
  const qs = contentType ? `?contentType=${contentType}` : '';
  const raw = await httpClient(`/api/progress${qs}`);
  return ListSchema.parse(raw);
}

export async function getTechniqueProgress(techniqueId: string): Promise<Progress | null> {
  try {
    const raw = await httpClient(`/api/progress/techniques/${techniqueId}`);
    return ProgressSchema.parse(raw);
  } catch (err) {
    // 404 = no progress recorded — return null so callers don't have to catch.
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function getPatternProgress(patternId: string): Promise<Progress | null> {
  // mirror
}

export async function upsertTechniqueProgress(techniqueId: string, input: UpsertProgressInput): Promise<Progress> {
  const raw = await httpClient(`/api/progress/techniques/${techniqueId}`, { method: 'PUT', body: input });
  return ProgressSchema.parse(raw);
}

export async function upsertPatternProgress(patternId: string, input: UpsertProgressInput): Promise<Progress> {
  // mirror
}

export async function deleteTechniqueProgress(techniqueId: string): Promise<void> {
  await httpClient(`/api/progress/techniques/${techniqueId}`, { method: 'DELETE' });
}

export async function deletePatternProgress(patternId: string): Promise<void> {
  await httpClient(`/api/progress/patterns/${patternId}`, { method: 'DELETE' });
}
```

**Note on the 404 → null pattern:** `httpClient` throws an Error-with-status on non-2xx responses (check `@/shared/api`'s implementation if uncertain). The catch above turns the "no row exists yet" case into a clean `null` so callers don't have to special-case it.

If `httpClient` doesn't expose a `.status` on the thrown error, swap to catching by `HttpError` instance or by message — adapt to whatever the codebase actually does. See `@/shared/api/HttpError` for the exact shape used by other features.

## Step 2: Hooks

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentType, UpsertProgressInput } from '@repo/contracts/progress';
import * as api from '../api/progress.api.js';

export const progressKeys = {
  list: (contentType?: ContentType) => ['progress', 'list', contentType ?? 'all'] as const,
  byTechnique: (id: string) => ['progress', 'technique', id] as const,
  byPattern: (id: string) => ['progress', 'pattern', id] as const,
};

export function useProgressListQuery(contentType?: ContentType) {
  return useQuery({
    queryKey: progressKeys.list(contentType),
    queryFn: () => api.getProgressList(contentType),
  });
}

export function useTechniqueProgressQuery(id: string | null) {
  return useQuery({
    queryKey: progressKeys.byTechnique(id ?? ''),
    queryFn: () => api.getTechniqueProgress(id!),
    enabled: !!id,
  });
}

export function usePatternProgressQuery(id: string | null) {
  return useQuery({
    queryKey: progressKeys.byPattern(id ?? ''),
    queryFn: () => api.getPatternProgress(id!),
    enabled: !!id,
  });
}

export function useUpsertTechniqueProgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertProgressInput }) =>
      api.upsertTechniqueProgress(id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['progress'] }),
  });
}

export function useUpsertPatternProgressMutation() {
  // mirror
}

export function useDeleteTechniqueProgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTechniqueProgress(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['progress'] }),
  });
}

export function useDeletePatternProgressMutation() {
  // mirror
}
```

## Step 3: Tests — 4 cases

Mirror Phase 2 `pattern.api.test.ts` style. Use real UUID v4s in fixtures.

Cases:
1. `getProgressList()` calls `/api/progress` with no query string.
2. `getProgressList('technique')` URL has `?contentType=technique`.
3. `upsertTechniqueProgress('id-1', { status: 'learning' })` PUTs body.
4. `getTechniqueProgress(...)` returns `null` when `httpClient` throws a 404-status error.

Progress stub for fixture parsing:
```ts
const stub = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user-abc',
  contentType: 'technique' as const,
  techniqueId: '550e8400-e29b-41d4-a716-446655440001',
  patternId: null,
  status: 'learning' as const,
  notes: '',
  lastPracticedAt: null,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z',
};
```

## Step 4: Barrel + verify + commit

```ts
// index.ts
export * from './api/progress.api.js';
export * from './lib/hooks.js';
```

```
pnpm --filter frontend exec vitest run src/entities/progress
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/entities/progress/
git commit -m "feat(entities-progress): API + React Query hooks"
```

---

## Task 6: Frontend — `ProgressPill` shared primitive

**Files (all new):**
- `apps/frontend/src/shared/ui/progress-pill.tsx`
- `apps/frontend/src/shared/ui/progress-pill.test.tsx`
- Modify: `apps/frontend/src/shared/ui/index.ts`

## Step 1: ProgressPill

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ProgressStatus } from '@repo/contracts/progress';

import { Button } from './button.js';
import { cn } from '@/shared/lib/utils';

const STATUS_LABEL_KEY: Record<ProgressStatus, string> = {
  not_started: 'progress.status.notStarted',
  learning: 'progress.status.learning',
  competent: 'progress.status.competent',
  grading_ready: 'progress.status.gradingReady',
};

// Brand-token palette. Each status gets a background + foreground class.
const STATUS_CLASS: Record<ProgressStatus, string> = {
  not_started:
    'border border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-container',
  learning:
    'bg-primary-container text-on-primary-container hover:bg-primary-container/80',
  competent:
    'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80',
  grading_ready:
    'bg-tertiary-container text-on-tertiary-container hover:bg-tertiary-container/80',
};

export interface ProgressPillProps {
  status: ProgressStatus | null;
  onClick: () => void;
  size?: 'xs' | 'sm';
  className?: string;
}

export function ProgressPill({
  status,
  onClick,
  size = 'sm',
  className,
}: ProgressPillProps): React.ReactElement {
  const { t } = useTranslation();
  const effective: ProgressStatus = status ?? 'not_started';
  const sizeClass = size === 'xs' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full transition-colors',
        sizeClass,
        STATUS_CLASS[effective],
        className,
      )}
      aria-label={t('progress.title') + ': ' + t(STATUS_LABEL_KEY[effective])}
    >
      {t(STATUS_LABEL_KEY[effective])}
    </button>
  );
}
```

If `tertiary-container` / `on-tertiary-container` tokens aren't defined in this codebase (check `globals.css`), fall back to a green Tailwind class set: `bg-emerald-100 text-emerald-900 hover:bg-emerald-200` (and the equivalent dark-mode variants if the project uses them). Likewise check `secondary-container`/`primary-container` — if either is missing, use Tailwind palette fallbacks (`amber-*` for gold/secondary, `blue-*` for navy/primary).

Recon `apps/frontend/src/app/styles/globals.css` to know which tokens are real before settling on classes.

## Step 2: Test — 2 cases

```tsx
// progress-pill.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProgressPill } from './progress-pill.js';

describe('<ProgressPill>', () => {
  it('renders the localised status label (raw key fallback in test env)', () => {
    render(<ProgressPill status="learning" onClick={() => {}} />);
    // i18n keys land in Task 10; before then, raw key text is fine.
    expect(screen.getByRole('button', { name: /learning|progress\.status\.learning/i })).toBeInTheDocument();
  });

  it('click fires the handler', () => {
    const onClick = vi.fn();
    render(<ProgressPill status="learning" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

## Step 3: Export from shared/ui/index.ts

```ts
export { ProgressPill, type ProgressPillProps } from './progress-pill.js';
```

## Step 4: Verify + commit

```
pnpm --filter frontend exec vitest run src/shared/ui/progress-pill
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/shared/ui/progress-pill.tsx \
        apps/frontend/src/shared/ui/progress-pill.test.tsx \
        apps/frontend/src/shared/ui/index.ts
git commit -m "feat(progress-pill): coloured status chip primitive"
```

---

## Task 7: Frontend — `ProgressEditorDialog` feature

**Files (all new):**
- `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.tsx`
- `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.test.tsx`
- `apps/frontend/src/features/progress-editor-dialog/index.ts`

Mirror `TechniqueFormDialog` for layout (Dialog + DialogContent + form + DialogFooter; the recent Phase 2 fix `1f5496c` switched these to `max-h-[85vh]` + `overflow-y-auto` — apply the same here).

## Step 1: Component

```tsx
// ProgressEditorDialog.tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  DatePicker,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  FormField, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/ui';
import type { ContentType, ProgressStatus, UpsertProgressInput } from '@repo/contracts/progress';
import {
  useTechniqueProgressQuery,
  usePatternProgressQuery,
  useUpsertTechniqueProgressMutation,
  useUpsertPatternProgressMutation,
  useDeleteTechniqueProgressMutation,
  useDeletePatternProgressMutation,
} from '@/entities/progress';

export interface ProgressEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ContentType;
  contentId: string;
  /** Optional display label for the dialog title. */
  contentLabel?: string;
}

const STATUS_VALUES: readonly ProgressStatus[] = ['not_started', 'learning', 'competent', 'grading_ready'];

export function ProgressEditorDialog({
  open, onOpenChange, contentType, contentId, contentLabel,
}: ProgressEditorDialogProps): React.ReactElement {
  const { t } = useTranslation();

  const techniqueQ = useTechniqueProgressQuery(contentType === 'technique' ? contentId : null);
  const patternQ = usePatternProgressQuery(contentType === 'pattern' ? contentId : null);
  const existing = contentType === 'technique' ? techniqueQ.data : patternQ.data;

  const [status, setStatus] = React.useState<ProgressStatus>('not_started');
  const [notes, setNotes] = React.useState('');
  const [lastPracticedAt, setLastPracticedAt] = React.useState<string>('');

  // Re-seed from existing row whenever the dialog opens or the row changes.
  React.useEffect(() => {
    if (!open) return;
    setStatus(existing?.status ?? 'not_started');
    setNotes(existing?.notes ?? '');
    setLastPracticedAt(existing?.lastPracticedAt ?? '');
  }, [open, existing?.id, existing?.status, existing?.notes, existing?.lastPracticedAt]);

  const upsertTech = useUpsertTechniqueProgressMutation();
  const upsertPat = useUpsertPatternProgressMutation();
  const deleteTech = useDeleteTechniqueProgressMutation();
  const deletePat = useDeletePatternProgressMutation();
  const pending = upsertTech.isPending || upsertPat.isPending || deleteTech.isPending || deletePat.isPending;

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const input: UpsertProgressInput = {
      status,
      notes,
      lastPracticedAt: lastPracticedAt.trim() === '' ? null : lastPracticedAt,
    };
    if (contentType === 'technique') {
      upsertTech.mutate({ id: contentId, input }, { onSuccess: () => onOpenChange(false) });
    } else {
      upsertPat.mutate({ id: contentId, input }, { onSuccess: () => onOpenChange(false) });
    }
  };

  const onReset = (): void => {
    if (!window.confirm(t('progress.resetConfirm'))) return;
    const onSuccess = () => onOpenChange(false);
    if (contentType === 'technique') deleteTech.mutate(contentId, { onSuccess });
    else deletePat.mutate(contentId, { onSuccess });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t('progress.title')}{contentLabel ? ` — ${contentLabel}` : ''}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 overflow-y-auto pr-1" noValidate>
          <FormField>
            <Label>{t('progress.title')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProgressStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`progress.status.${s === 'not_started' ? 'notStarted' : s === 'grading_ready' ? 'gradingReady' : s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="progress-notes">{t('progress.notes')}</Label>
            <textarea
              id="progress-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              rows={4}
              maxLength={2000}
            />
          </FormField>

          <FormField>
            <Label>{t('progress.lastPracticed')}</Label>
            <DatePicker
              value={lastPracticedAt}
              onChange={(next) => setLastPracticedAt(next)}
            />
          </FormField>

          <DialogFooter className="mt-auto flex flex-wrap gap-2">
            {existing ? (
              <Button type="button" variant="outline" onClick={onReset} disabled={pending}>
                {t('progress.reset')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('progress.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

## Step 2: Test — 3 cases

Mock all four mutation hooks and both query hooks. Cases:

1. Renders the status select + notes textarea + date picker.
2. Submitting calls the upsert mutation with `{ status, notes, lastPracticedAt }`.
3. Clicking "Reset" with confirm calls the delete mutation.

For the test, mock `window.confirm` via `vi.stubGlobal('confirm', () => true)`.

## Step 3: Barrel

```ts
// features/progress-editor-dialog/index.ts
export { ProgressEditorDialog, type ProgressEditorDialogProps } from './ui/ProgressEditorDialog.js';
```

## Step 4: Verify + commit

```
pnpm --filter frontend exec vitest run src/features/progress-editor-dialog
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/features/progress-editor-dialog/
git commit -m "feat(progress): ProgressEditorDialog feature"
```

---

## Task 8: Frontend — wire pills into TechniquesPage + AdminTechniquesPage

**Files:**
- Modify: `apps/frontend/src/pages/techniques/ui/TechniquesPage.tsx`
- Modify: `apps/frontend/src/pages/admin-techniques/ui/AdminTechniquesPage.tsx`

## Step 1: TechniquesPage

Add to the imports:
```ts
import { ProgressPill } from '@/shared/ui';
import { useProgressListQuery } from '@/entities/progress';
import { ProgressEditorDialog } from '@/features/progress-editor-dialog';
```

Inside the component:
```ts
const { data: allProgress = [] } = useProgressListQuery();
const progressByTechniqueId = React.useMemo(
  () => new Map(allProgress.filter((p) => p.techniqueId).map((p) => [p.techniqueId!, p])),
  [allProgress],
);

const [editingId, setEditingId] = React.useState<{ id: string; label: string } | null>(null);
```

Inside the list rendering of each technique row, add the pill:
```tsx
<ProgressPill
  status={progressByTechniqueId.get(row.id)?.status ?? null}
  onClick={() => setEditingId({ id: row.id, label: row.nameRomaji })}
/>
```

Position the pill where it fits visually — typically right of the row title.

Mount the dialog at the page root (alongside the existing structure):
```tsx
{editingId ? (
  <ProgressEditorDialog
    open
    onOpenChange={(o) => { if (!o) setEditingId(null); }}
    contentType="technique"
    contentId={editingId.id}
    contentLabel={editingId.label}
  />
) : null}
```

## Step 2: AdminTechniquesPage

Same wiring — admin page renders the pill too so the admin sees their own progress when browsing.

## Step 3: Update tests

The existing tests for both pages may break if they assert on row layout. Adapt:
- Mock `useProgressListQuery` to return `{ data: [] }`.
- Don't mock `ProgressPill` — it'll render the raw-key fallback label.
- If a test asserts the row contains only certain elements, loosen the assertion to accept the new pill.

## Step 4: Verify + commit

```
pnpm --filter frontend exec vitest run src/pages/techniques src/pages/admin-techniques
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/pages/techniques/ apps/frontend/src/pages/admin-techniques/
git commit -m "feat(techniques): progress pill + editor dialog on catalogue rows"
```

---

## Task 9: Frontend — wire pills into PatternsPage + AdminPatternsPage

**Files:**
- Modify: `apps/frontend/src/pages/patterns/ui/PatternsPage.tsx`
- Modify: `apps/frontend/src/pages/admin-patterns/ui/AdminPatternsPage.tsx`

Mirror Task 8 exactly with `patternId` instead of `techniqueId` and `contentType="pattern"` for the dialog. Use the same `useProgressListQuery()` (one HTTP call covers both content types).

```ts
const progressByPatternId = React.useMemo(
  () => new Map(allProgress.filter((p) => p.patternId).map((p) => [p.patternId!, p])),
  [allProgress],
);
```

Verify + commit:

```
pnpm --filter frontend exec vitest run src/pages/patterns src/pages/admin-patterns
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/pages/patterns/ apps/frontend/src/pages/admin-patterns/
git commit -m "feat(patterns): progress pill + editor dialog on catalogue rows"
```

---

## Task 10: i18n keys (en/sv/fi)

**Files:**
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

### en.json

Add a top-level `progress` block:

```json
"progress": {
  "title": "Progress",
  "status": {
    "notStarted": "Not started",
    "learning": "Learning",
    "competent": "Competent",
    "gradingReady": "Grading ready"
  },
  "notes": "Notes",
  "lastPracticed": "Last practiced",
  "save": "Save",
  "reset": "Reset progress",
  "resetConfirm": "Reset progress for this item? Notes and last-practiced date will be lost.",
  "errors": {
    "invalidContent": "This content no longer exists."
  }
}
```

### sv.json

```json
"progress": {
  "title": "Framsteg",
  "status": {
    "notStarted": "Ej påbörjat",
    "learning": "Lär mig",
    "competent": "Behärskar",
    "gradingReady": "Redo för gradering"
  },
  "notes": "Anteckningar",
  "lastPracticed": "Senast tränat",
  "save": "Spara",
  "reset": "Återställ framsteg",
  "resetConfirm": "Återställ framsteg för detta moment? Anteckningar och datum för senaste träning går förlorade.",
  "errors": {
    "invalidContent": "Detta innehåll finns inte längre."
  }
}
```

### fi.json

```json
"progress": {
  "title": "Edistyminen",
  "status": {
    "notStarted": "Ei aloitettu",
    "learning": "Opiskelen",
    "competent": "Hallitsen",
    "gradingReady": "Valmis arviointiin"
  },
  "notes": "Muistiinpanot",
  "lastPracticed": "Viimeksi harjoiteltu",
  "save": "Tallenna",
  "reset": "Nollaa edistyminen",
  "resetConfirm": "Nollataanko edistyminen tälle kohteelle? Muistiinpanot ja viimeisin harjoittelupäivä menetetään.",
  "errors": {
    "invalidContent": "Tätä sisältöä ei enää ole."
  }
}
```

## Step 4: Update tests that asserted raw-key text

Page + pill + dialog tests that used raw-key regex (e.g. `/progress\.status\.learning/i`) need to match the seeded translations now. Update:
- `/learning|opiskelen|lär mig/i` (any of the three locales) — same approach as Phase 1 Task 12 + Phase 2 Task 11 did.

## Step 5: Verify + commit

```
pnpm --filter frontend exec vitest run src/features/progress-editor-dialog src/shared/ui/progress-pill src/pages/techniques src/pages/patterns
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/i18n/locales/
git commit -m "feat(i18n): progress keys (en/sv/fi)"
```

If page tests broke from the i18n change, fold the test fixes into the same commit.

---

## Task 11: Full pipeline + clean tree

**Files:** None modified — verification only.

- [ ] **Step 1: Regenerate OpenAPI if needed**

```
pnpm openapi:generate
```

If diff is empty: no commit. If a diff exists, commit:

```
git add packages/contracts/openapi/
git commit -m "chore(contracts): regen OpenAPI after progress module"
```

- [ ] **Step 2: Backend tests + typecheck**

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

Expected: 338+/338+, tsc exit 0.

- [ ] **Step 3: Contracts tests + typecheck + build**

```
pnpm --filter @repo/contracts exec vitest run
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts build
```

Expected: 173/173.

- [ ] **Step 4: Frontend full pipeline**

```
cd apps/frontend
npx vitest run
npx tsc --noEmit
npm run arch
npx vite build
```

Expected:
- Tests pass (mind the flaky `profile-form` + `organisation-form` from Phase 1 — re-run in isolation if needed).
- Typecheck clean.
- Arch: 0 errors. Warnings will bump for new `entities/progress` and `features/progress-editor-dialog` slices (same `insignificant-slice` pattern from Phase 1 + Phase 2).
- Build clean.

- [ ] **Step 5: Clean tree confirmation**

```
git status --short
```

Expected: empty except the pre-existing dirty `NavUser.tsx` (and possibly `belt-catalog.seed.json` if it still hangs around).

---

## Self-Review Notes

Spec coverage check:
- §4.1 `user_content_progress` table → Task 1 ✓
- §4.2 polymorphic + status CHECK + partial unique indexes → Task 1 ✓
- §5 CASL Progress → Tasks 2 + 3 ✓
- §6 REST API → Task 3 controller ✓
- §6.1 INVALID_CONTENT 404 → Task 3 service `assertContentExists` ✓
- §7 backend module shape → Task 3 ✓
- §7.1 upsert semantics → Task 3 ✓
- §7.2 delete + audit → Task 3 ✓
- §7.3 self-scope on list → Task 3 ✓
- §8 Zod contracts → Task 2 ✓
- §9.1 entity slice → Task 5 ✓
- §9.2 ProgressPill primitive → Task 6 ✓
- §9.3 ProgressEditorDialog → Task 7 ✓
- §9.4 wire into catalogue rows → Tasks 8 + 9 ✓
- §9.5 bulk progress lookup via `useProgressListQuery` → Tasks 8 + 9 ✓
- §10 i18n → Task 10 ✓
- §11 migration → Task 1 ✓
- §12 testing → covered across every Task ✓
- §13 acceptance criteria → backend specs + frontend tests cover all listed cases ✓

Placeholder scan: no TBDs. Where the helper API depends on platform specifics (drizzle's `check()` availability, httpClient's error shape), explicit fallback paths are given so the implementer doesn't get stuck.

Type consistency:
- `contentType` literal `'technique' | 'pattern'` used everywhere ✓
- `ProgressStatus` enum + `PROGRESS_STATUSES` const tuple are the single source of truth ✓
- `userId` is text (matches `user.id` shape) ✓

Total task count: 11. Estimated commit count: 11-13 (Task 4 produces 1-2 depending on OpenAPI churn; Task 11 may emit 0 or 1 depending on regen idempotency).
