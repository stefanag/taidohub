# Techniques (Phase 3.5 — Instructor view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let instructors browse the students in their organisations and write progress on their behalf, with split student/instructor notes and full audit attribution.

**Architecture:** No new domain table — reuse Phase 3's `user_content_progress`, but split its `notes` column into `student_notes` + `instructor_notes` so each side owns one channel. Add `audit_log.acting_user_id` to attribute on-behalf-of writes. New `StudentsModule` exposes roster + per-student progress + on-behalf-of upsert/delete, with row-level CASL via a new `Student` subject whose conditional rule overlaps the caller's `instructor`-role org memberships against the student's memberships. Frontend gets `/students` + `/students/:userId` pages, a `useMyMembershipsQuery` for sidebar gating, and a new `StudentProgressEditorDialog`.

**Tech Stack:** NestJS 11 · Drizzle ORM 0.45.2 + Postgres 15 · Zod 4.4.3 · CASL 6 · React 19 + TanStack Router + TanStack Query · shadcn primitives.

**Spec:** `docs/superpowers/specs/2026-06-12-techniques-phase3-5-instructor-view-design.md` (commit `9aa1387`)

**Phase 3 baseline:** `70f5386` (progress + pills).

---

## File Map

**Created:**
- `apps/backend/drizzle/0022_*.sql` (auto-generated)
- `apps/backend/drizzle/0023_*.sql` (auto-generated)
- `apps/backend/src/modules/students/students.repository.ts`
- `apps/backend/src/modules/students/students.service.ts`
- `apps/backend/src/modules/students/students.service.spec.ts`
- `apps/backend/src/modules/students/students.controller.ts`
- `apps/backend/src/modules/students/students.module.ts`
- `apps/backend/src/modules/students/students.ability-rules.ts`
- `apps/backend/src/modules/students/students.ability-rules.spec.ts`
- `apps/frontend/src/entities/me/api/me.api.ts`
- `apps/frontend/src/entities/me/api/me.api.test.ts`
- `apps/frontend/src/entities/me/lib/hooks.ts`
- `apps/frontend/src/entities/me/index.ts`
- `apps/frontend/src/entities/student/api/student.api.ts`
- `apps/frontend/src/entities/student/api/student.api.test.ts`
- `apps/frontend/src/entities/student/lib/hooks.ts`
- `apps/frontend/src/entities/student/index.ts`
- `apps/frontend/src/features/student-progress-editor-dialog/ui/StudentProgressEditorDialog.tsx`
- `apps/frontend/src/features/student-progress-editor-dialog/ui/StudentProgressEditorDialog.test.tsx`
- `apps/frontend/src/features/student-progress-editor-dialog/index.ts`
- `apps/frontend/src/pages/students/ui/StudentsPage.tsx`
- `apps/frontend/src/pages/students/ui/StudentsPage.test.tsx`
- `apps/frontend/src/pages/students/index.ts`
- `apps/frontend/src/pages/student-detail/ui/StudentDetailPage.tsx`
- `apps/frontend/src/pages/student-detail/ui/StudentDetailPage.test.tsx`
- `apps/frontend/src/pages/student-detail/index.ts`
- `apps/frontend/src/app/router/routes/_app.students.tsx`
- `apps/frontend/src/app/router/routes/_app.students.$userId.tsx`

**Modified:**
- `apps/backend/src/infrastructure/database/schema/user-content-progress.ts` (notes split)
- `apps/backend/src/infrastructure/database/schema/audit-log.ts` (`acting_user_id`)
- `apps/backend/src/modules/progress/progress.service.ts` (new on-behalf-of methods + acting_user_id propagation)
- `apps/backend/src/modules/progress/progress.service.spec.ts` (assertions on new columns)
- `apps/backend/src/modules/audit-log/audit-log.service.ts` + `.repository.ts` (`actingUserId` in `RecordInput`)
- `apps/backend/src/modules/audit-log/audit-log.service.spec.ts` (new field assertions)
- Every existing `auditLog.record({...})` caller (~14 sites; thread `actingUserId: null`)
- `apps/backend/src/app.module.ts` (register `StudentsModule`)
- `apps/backend/src/infrastructure/ability/ability.factory.ts` + `ability.module.ts` (StudentAbilityRules)
- `packages/contracts/src/progress.ts` (rename `notes` → `studentNotes`, add `instructorNotes`, add `UpsertInstructorProgressSchema`)
- `packages/contracts/src/students.ts` (new module with `StudentRosterRowSchema`)
- `packages/contracts/src/casl.ts` (add `Student` subject)
- `packages/contracts/src/index.ts` (re-export `students`)
- `packages/contracts/src/openapi.ts` (register `StudentsOpenApiRegistry`)
- `packages/contracts/tsup.config.ts` + `package.json` (`./students` entry)
- `packages/contracts/openapi/openapi.{yaml,json}` (regenerated)
- `apps/frontend/src/entities/progress/api/progress.api.ts` + tests (renamed field)
- `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.tsx` (rename note label + add read-only instructor-notes section)
- `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.test.tsx`
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` (Students entry)
- `apps/frontend/src/app/router/routeTree.gen.ts` (regenerated)
- `apps/frontend/src/i18n/locales/{en,sv,fi}.json` (`nav.students`, `students.*`, `progress.studentNotes`, `progress.instructorNotes`)

---

## Task 1: DB — split `user_content_progress.notes` (migration 0022)

**Files:**
- Modify: `apps/backend/src/infrastructure/database/schema/user-content-progress.ts`
- Create: `apps/backend/drizzle/0022_*.sql` (auto-generated)

## Step 0: Recon

Read `apps/backend/src/infrastructure/database/schema/user-content-progress.ts` (Phase 3 commit `2834a6c`). The `notes` column is `text NOT NULL DEFAULT ''`.

## Step 1: Schema

Replace the `notes` field with:

```ts
studentNotes: text('student_notes').notNull().default(''),
instructorNotes: text('instructor_notes').notNull().default(''),
```

Keep all other fields + CHECK constraints + indexes unchanged.

## Step 2: Generate migration

```
cd apps/backend && npx drizzle-kit generate
```

Expected: `0022_<adjective>_<noun>.sql` with:
- `ALTER TABLE user_content_progress DROP COLUMN notes;`
- `ALTER TABLE user_content_progress ADD COLUMN student_notes text DEFAULT '' NOT NULL;`
- `ALTER TABLE user_content_progress ADD COLUMN instructor_notes text DEFAULT '' NOT NULL;`

If drizzle-kit emits the operations in a different order (ADDs before DROP), reorder them so DROP runs first (avoids transient row-with-three-notes-columns state).

The Phase 3.5 scoping decision was to drop existing `notes` content without copy. No backfill SQL needed.

## Step 3: Apply locally

```
pnpm --filter backend run db:migrate
```

## Step 4: Verify

```
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: typecheck errors will appear in `progress.service.ts` and `progress.repository.ts` because they reference `row.notes`. **Don't fix here** — Task 4 will plumb the rename through. You can confirm the errors exist (proves the schema change took effect) but commit them as TS errors for Task 4 to address.

Actually — Drizzle's `$inferSelect` will start including `studentNotes` + `instructorNotes` instead of `notes`. Every site that reads `row.notes` will fail TS. That's exactly the surface area Task 4 owns. For Task 1's verification step, run only the migration apply + the `vitest run` against modules unaffected by progress:

```
pnpm --filter backend exec vitest run --reporter dot src/modules/users src/modules/labels src/modules/feature-flags
```

Or just run the full suite and note that progress tests will fail until Task 4 fixes them. **Commit Task 1 with the migration applied; subsequent Tasks 4-5 will get backend back to green.**

## Step 5: Commit

```
git add apps/backend/src/infrastructure/database/schema/user-content-progress.ts \
        apps/backend/drizzle/0022_*.sql \
        apps/backend/drizzle/meta/
git commit -m "feat(db): split user_content_progress.notes into student_notes + instructor_notes (migration 0022)"
```

---

## Task 2: DB — add `audit_log.acting_user_id` (migration 0023)

**Files:**
- Modify: `apps/backend/src/infrastructure/database/schema/audit-log.ts`
- Create: `apps/backend/drizzle/0023_*.sql` (auto-generated)

## Step 1: Schema

Add to the `audit_log` table:

```ts
actingUserId: text('acting_user_id').references(() => user.id, { onDelete: 'set null' }),
```

Place it after `impersonatedById` for symmetry.

## Step 2: Generate

```
cd apps/backend && npx drizzle-kit generate
```

Expected: `0023_<adjective>_<noun>.sql` with `ALTER TABLE audit_log ADD COLUMN acting_user_id text;` plus the FK constraint.

## Step 3: Apply locally

```
pnpm --filter backend run db:migrate
```

## Step 4: Verify (partial — backend may still fail from Task 1)

```
cd apps/backend && npx tsc --noEmit
```

Expected: same TS errors from Task 1 (progress references to `row.notes`). No NEW errors from this task — adding a nullable column doesn't break callers.

## Step 5: Commit

```
git add apps/backend/src/infrastructure/database/schema/audit-log.ts \
        apps/backend/drizzle/0023_*.sql \
        apps/backend/drizzle/meta/
git commit -m "feat(db): audit_log.acting_user_id for on-behalf-of audit attribution (migration 0023)"
```

---

## Task 3: Contracts — `progress` updates + `students` module + `Student` CASL subject

**Files:**
- Modify: `packages/contracts/src/progress.ts` (rename `notes` → `studentNotes`, add `instructorNotes`, add `UpsertInstructorProgressSchema`)
- Create: `packages/contracts/src/students.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/openapi.ts`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/package.json`

## Step 1: progress.ts updates

Rename `notes` → `studentNotes` in `ProgressSchema`. Add `instructorNotes`:

```ts
export const ProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  contentType: ContentTypeSchema,
  techniqueId: z.string().uuid().nullable(),
  patternId: z.string().uuid().nullable(),
  status: ProgressStatusSchema,
  studentNotes: z.string(),
  instructorNotes: z.string(),
  lastPracticedAt: IsoDate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'Progress', /* update example accordingly */ });

export const UpsertProgressSchema = z.object({
  status: ProgressStatusSchema,
  studentNotes: z.string().max(2000).default(''),
  lastPracticedAt: IsoDate.nullable().optional(),
}).meta({ id: 'UpsertProgressInput', description: 'Body for self-scoped PUT /api/progress. Touches student_notes only.' });

export const UpsertInstructorProgressSchema = z.object({
  status: ProgressStatusSchema,
  instructorNotes: z.string().max(2000).default(''),
  lastPracticedAt: IsoDate.nullable().optional(),
}).meta({ id: 'UpsertInstructorProgressInput', description: 'Body for PUT /api/students/:userId/progress/... Touches instructor_notes only.' });

export type Progress = z.infer<typeof ProgressSchema>;
export type UpsertProgressInput = z.infer<typeof UpsertProgressSchema>;
export type UpsertInstructorProgressInput = z.infer<typeof UpsertInstructorProgressSchema>;

export const ProgressOpenApiRegistry = {
  Progress: ProgressSchema,
  UpsertProgressInput: UpsertProgressSchema,
  UpsertInstructorProgressInput: UpsertInstructorProgressSchema,
} as const;
```

Keep `PROGRESS_STATUSES`, `CONTENT_TYPES`, etc unchanged.

## Step 2: students.ts (new file)

```ts
// packages/contracts/src/students.ts
import { z } from 'zod';

import { PROGRESS_STATUSES } from './progress.js';

export const StudentRosterRowSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  organisations: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
  })),
  progressSummary: z.object(Object.fromEntries(
    PROGRESS_STATUSES.map((s) => [s, z.number().int().nonnegative()]),
  ) as Record<typeof PROGRESS_STATUSES[number], z.ZodNumber>),
}).meta({
  id: 'StudentRosterRow',
  description: 'A student visible to the calling instructor (or any student for sysadmin).',
});

export type StudentRosterRow = z.infer<typeof StudentRosterRowSchema>;

export const StudentsOpenApiRegistry = {
  StudentRosterRow: StudentRosterRowSchema,
} as const;
```

## Step 3: CASL — `Student` subject

In `packages/contracts/src/casl.ts`:

1. Add `'Student'` to `SubjectSchema` BEFORE `'all'`.
2. Add to `AppSubject` union.
3. Add the shape:

```ts
export type StudentSubjectShape = {
  readonly __caslSubjectType__: 'Student';
  /** Org ids the student is a member of (one entry per membership row). */
  organisationIds?: readonly string[];
};
```

## Step 4: Re-export + openapi.ts + tsup + package.json

Mirror Phase 3 Task 2's pattern (`4c1aa02`):

- `index.ts`: `export * from './students.js';`
- `openapi.ts`: import `StudentsOpenApiRegistry`, add to defaults + ContractRegistries map
- `tsup.config.ts`: append `'src/students.ts'` to entry
- `package.json`: add `./students` exports entry

## Step 5: Verify

```
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
pnpm --filter @repo/contracts build
```

Expected: typecheck clean, 173/173 pass, build emits `dist/students.js` + variants.

Backend will fail typecheck because `progress.notes` references are now invalid types — that's expected; Task 4 fixes them.

## Step 6: Commit

```
git add packages/contracts/src/progress.ts \
        packages/contracts/src/students.ts \
        packages/contracts/src/casl.ts \
        packages/contracts/src/index.ts \
        packages/contracts/src/openapi.ts \
        packages/contracts/tsup.config.ts \
        packages/contracts/package.json
git commit -m "feat(contracts): split progress notes + Student subject + StudentRosterRow"
```

---

## Task 4: Backend — extend `ProgressService` + `AuditLogService.RecordInput`

**Files:**
- Modify: `apps/backend/src/modules/audit-log/audit-log.service.ts` (add `actingUserId` to RecordInput)
- Modify: `apps/backend/src/modules/audit-log/audit-log.repository.ts` (write the new column)
- Modify: `apps/backend/src/modules/audit-log/audit-log.service.spec.ts`
- Modify: Every existing `auditLog.record({...})` caller (find via grep)
- Modify: `apps/backend/src/modules/progress/progress.service.ts`
- Modify: `apps/backend/src/modules/progress/progress.service.spec.ts`
- Modify: `apps/backend/src/modules/progress/progress.repository.ts` (if it references `notes`)

This is the big plumbing task — same pattern as Phase 2 Task 5 (impersonation `impersonatedById` rollout).

## Step 1: Add `actingUserId` to `AuditLogService.RecordInput`

In `audit-log.service.ts`:

```ts
export interface RecordInput {
  tx: DrizzleExecutor;
  entityType: string;
  entityId: string;
  action: AuditLogAction;
  userId: string | null;
  impersonatedById: string | null;
  /** Set when the action's subject (`userId`) is different from the
   *  authenticated session that performed it, but NOT via session
   *  impersonation. Today: instructor writes on a student's row.
   *  Null in every other case. */
  actingUserId: string | null;
  before: unknown | null;
  after: unknown | null;
}
```

Pass through in `record()`. Update `audit-log.repository.ts` to write the column (Drizzle's `$inferInsert` auto-picks it up).

Update `audit-log.service.spec.ts`: add assertion that `actingUserId` round-trips. Existing tests get a `actingUserId: null` added wherever they construct a `RecordInput`.

## Step 2: Thread `actingUserId: null` through every existing caller

```
grep -rn "auditLog\.record\|this\.audit\.record" apps/backend/src --include='*.ts'
```

The set is the same ~14 sites Phase 2's impersonation work touched (commit `222570c`). For each, add `actingUserId: null` to the literal.

Don't change semantics — every existing caller is a self-action (caller writes their own row OR sysadmin-action). `null` is correct for all of them.

## Step 3: Update Phase 3 `ProgressService`

Rename `notes` → `studentNotes` in:
- `toApi()` builder
- `snapshot()` helper
- `upsert()`'s insert + update paths
- The test fixtures

Add `instructorNotes: row.instructorNotes` to `toApi()` and `snapshot()`.

Self-scoped `upsert` (existing method) now only writes `studentNotes`. Confirm `UpsertProgressInput.studentNotes` flows in.

Add two new methods:

```ts
async upsertOnBehalfOf(
  actor: AuthenticatedUser,
  subjectUserId: string,
  contentType: ContentType,
  contentId: string,
  input: UpsertInstructorProgressInput,
): Promise<Progress> {
  await this.assertContentExists(contentType, contentId);

  return this.db.transaction(async (tx) => {
    const existing = await this.repo.findByUserAndContent(subjectUserId, contentType, contentId, tx);
    const now = new Date();

    let row: ProgressRow;
    let action: 'create' | 'update';
    let before: ProgressRow | null;

    if (existing) {
      before = existing;
      action = 'update';
      row = await this.repo.update(
        existing.id,
        {
          status: input.status,
          instructorNotes: input.instructorNotes ?? '',
          lastPracticedAt: input.lastPracticedAt ?? null,
          updatedAt: now,
        },
        tx,
      );
    } else {
      before = null;
      action = 'create';
      row = await this.repo.insert({
        userId: subjectUserId,
        contentType,
        techniqueId: contentType === 'technique' ? contentId : null,
        patternId:   contentType === 'pattern'   ? contentId : null,
        status: input.status,
        studentNotes: '',
        instructorNotes: input.instructorNotes ?? '',
        lastPracticedAt: input.lastPracticedAt ?? null,
      }, tx);
    }

    await this.audit.record({
      tx,
      entityType: 'progress',
      entityId: row.id,
      action,
      userId: subjectUserId,
      impersonatedById: actor.impersonatedBy ?? null,
      actingUserId: actor.id,           // instructor
      before: before ? this.snapshot(before) : null,
      after: this.snapshot(row),
    });

    return this.toApi(row);
  });
}

async deleteOnBehalfOf(
  actor: AuthenticatedUser,
  subjectUserId: string,
  contentType: ContentType,
  contentId: string,
): Promise<void> {
  const row = await this.repo.findByUserAndContent(subjectUserId, contentType, contentId);
  if (!row) {
    throw new NotFoundException({
      error: { code: 'NOT_FOUND', message: `No progress recorded for ${contentType} ${contentId}.` },
    });
  }

  await this.db.transaction(async (tx) => {
    await this.repo.delete(row.id, tx);
    await this.audit.record({
      tx,
      entityType: 'progress',
      entityId: row.id,
      action: 'delete',
      userId: subjectUserId,
      impersonatedById: actor.impersonatedBy ?? null,
      actingUserId: actor.id,
      before: this.snapshot(row),
      after: null,
    });
  });
}
```

The Phase 3 `assertCanManage` (CASL on Progress) is NOT called on these methods — Task 5's `StudentsService` does the gating via the `Student` subject before calling these.

## Step 4: Update `progress.service.spec.ts`

- Existing tests now assert on `studentNotes` instead of `notes`.
- Add 4 new cases:
  - `upsertOnBehalfOf` creates a row with `student_notes=''`, `instructor_notes=<input>`, `userId=subjectUserId`
  - `upsertOnBehalfOf` audit emits `actingUserId=actor.id`, `userId=subjectUserId`
  - `upsertOnBehalfOf` update path does NOT touch `student_notes` (mock-asserted)
  - `deleteOnBehalfOf` removes and audits with `actingUserId`

## Step 5: Update `ProgressRepository`

If `progress.repository.ts` references `notes` anywhere (probably not — most repos use `$inferSelect` types), swap to the split columns. Otherwise no change.

## Step 6: Verify

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

Expected: full backend suite green again. ~338 + 4 new progress tests + 1 new audit-log assertion = ~343 passing.

## Step 7: Commit

```
git add apps/backend/src/modules/audit-log/ \
        apps/backend/src/modules/progress/ \
        apps/backend/src/modules/   # any other modules touched by audit caller rollout
git commit -m "feat(audit-log,progress): actingUserId + on-behalf-of upsert/delete + notes split rename"
```

---

## Task 5: Backend — `StudentsModule` (repo + service + controller + ability + spec)

**Files (all new):**
- `apps/backend/src/modules/students/students.repository.ts`
- `apps/backend/src/modules/students/students.service.ts`
- `apps/backend/src/modules/students/students.service.spec.ts`
- `apps/backend/src/modules/students/students.controller.ts`
- `apps/backend/src/modules/students/students.module.ts`
- `apps/backend/src/modules/students/students.ability-rules.ts`
- `apps/backend/src/modules/students/students.ability-rules.spec.ts`

## Step 0: Recon

1. Phase 3 `ProgressModule` (`a02037b`) — closest reference for service + controller shape.
2. `apps/backend/src/modules/audit-log/audit-log.service.ts` — for the precedent of doing service-layer authorization with explicit memberships branching.
3. `apps/backend/src/infrastructure/database/schema/memberships.ts` — `organisation_membership` table shape.
4. `apps/backend/src/infrastructure/database/schema/users.ts` — `user` table.
5. `apps/backend/src/infrastructure/database/schema/organisations.ts` — `organisations` table.

## Step 1: Repository

```ts
@Injectable()
export class StudentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Distinct user ids that are members of the given organisation ids. */
  async listStudentIdsInOrgs(orgIds: readonly string[], excludeUserId?: string): Promise<string[]>;

  /** Roster rows for the given user ids: user fields + their orgs + their progress counts. */
  async listRosterByUserIds(userIds: readonly string[]): Promise<StudentRosterRow[]>;

  /** Sysadmin path: roster of every user with at least one membership. */
  async listAllRoster(): Promise<StudentRosterRow[]>;

  /** Org ids the student is a member of. Used by the CASL subject constructor. */
  async listOrgIdsForUser(userId: string): Promise<string[]>;
}
```

Hydrate the roster via the SQL from spec §7.2 — `JOIN organisation_membership + organisations + LEFT JOIN user_content_progress`, `GROUP BY u.id`, with `COUNT(*) FILTER (WHERE p.status = '<s>')` per status.

## Step 2: Service

```ts
@Injectable()
export class StudentsService {
  constructor(
    private readonly repo: StudentsRepository,
    private readonly progress: ProgressService,
    private readonly abilities: AbilityFactory,
    // ProgressRepository is needed for the per-student progress list.
    private readonly progressRepo: ProgressRepository,
  ) {}

  async listRoster(actor: AuthenticatedUser): Promise<StudentRosterRow[]> {
    if (actor.role === 'sysadmin') {
      return this.repo.listAllRoster();
    }
    const instructorOrgs = actor.memberships
      .filter((m) => m.role === 'instructor')
      .map((m) => m.organisationId);
    if (instructorOrgs.length === 0) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Not an instructor in any organisation.' },
      });
    }
    const userIds = await this.repo.listStudentIdsInOrgs(instructorOrgs);
    return this.repo.listRosterByUserIds(userIds);
  }

  async getStudentProgress(actor: AuthenticatedUser, studentUserId: string): Promise<Progress[]> {
    await this.assertCanManageStudent(actor, studentUserId);
    const rows = await this.progressRepo.listByUser(studentUserId);
    return rows.map((r) => this.progress.toApi(r));   // expose toApi via service or hoist a helper
  }

  async upsertStudentProgress(
    actor: AuthenticatedUser,
    studentUserId: string,
    contentType: ContentType,
    contentId: string,
    input: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    await this.assertCanManageStudent(actor, studentUserId);
    return this.progress.upsertOnBehalfOf(actor, studentUserId, contentType, contentId, input);
  }

  async deleteStudentProgress(
    actor: AuthenticatedUser,
    studentUserId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    await this.assertCanManageStudent(actor, studentUserId);
    await this.progress.deleteOnBehalfOf(actor, studentUserId, contentType, contentId);
  }

  private async assertCanManageStudent(actor: AuthenticatedUser, studentUserId: string): Promise<void> {
    const ability = this.abilities.createForUser(actor);
    const orgIds = await this.repo.listOrgIdsForUser(studentUserId);
    const instance = { __caslSubjectType__: 'Student' as const, organisationIds: orgIds };
    if (ability.cannot('manage', instance)) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this student.' },
      });
    }
  }
}
```

**Important:** `ProgressService.toApi(row)` is currently `private`. Make it public OR (cleaner) move it into a small `progress.mapper.ts` shared between the two services. The plan recommends `public toApi(...)` as the smallest change.

## Step 3: Service spec (8 cases)

Per spec §11.1:
1. roster lists students from caller's instructor orgs only
2. sysadmin gets unfiltered roster
3. caller with no instructor memberships → 403 on roster
4. `getStudentProgress` 403s when target student not in any of caller's instructor orgs
5. `upsertStudentProgress` writes `instructor_notes` only (mock-asserted via `progress.upsertOnBehalfOf` spy)
6. `upsertStudentProgress` audit row has `actingUserId` set (mock-asserted)
7. `deleteStudentProgress` cascades + writes audit
8. CASL: instructor with org `A` manages Student with `organisationIds: ['A', 'B']` but NOT `organisationIds: ['B']`

Use thin mocks for `StudentsRepository`, `ProgressService`, `ProgressRepository`, `AbilityFactory`.

## Step 4: Controller

```ts
@Controller()  // root prefix so /me/memberships sits alongside /students
export class StudentsController {
  constructor(
    private readonly service: StudentsService,
  ) {}

  @Get('me/memberships')
  myMemberships(@CurrentUser() user: AuthenticatedUser): { organisationId: string; role: string }[] {
    return user.memberships.map((m) => ({ organisationId: m.organisationId, role: m.role }));
  }

  @Get('students')
  list(@CurrentUser() user: AuthenticatedUser): Promise<StudentRosterRow[]> {
    return this.service.listRoster(user);
  }

  @Get('students/:userId/progress')
  getStudentProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<Progress[]> {
    return this.service.getStudentProgress(user, userId);
  }

  @Put('students/:userId/progress/techniques/:contentId')
  upsertTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(UpsertInstructorProgressSchema)) body: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    return this.service.upsertStudentProgress(user, userId, 'technique', contentId, body);
  }

  @Put('students/:userId/progress/patterns/:contentId')
  upsertPattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body(new ZodValidationPipe(UpsertInstructorProgressSchema)) body: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    return this.service.upsertStudentProgress(user, userId, 'pattern', contentId, body);
  }

  @Delete('students/:userId/progress/techniques/:contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<void> {
    return this.service.deleteStudentProgress(user, userId, 'technique', contentId);
  }

  @Delete('students/:userId/progress/patterns/:contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<void> {
    return this.service.deleteStudentProgress(user, userId, 'pattern', contentId);
  }
}
```

## Step 5: Ability rules + spec

```ts
@Injectable()
export class StudentAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'Student');
      return;
    }
    const instructorOrgs = user.memberships
      .filter((m) => m.role === 'instructor')
      .map((m) => m.organisationId);
    if (instructorOrgs.length > 0) {
      builder.can('manage', 'Student', { organisationIds: { $in: instructorOrgs } });
      builder.can('read', 'Student');   // unconditional read for routing/controller-level checks
    }
  }
}
```

**Verification step:** write a test that asserts the `$in`-on-array-field behaves as overlap (the spec §5.2 callout). If CASL evaluates `$in` against an array-valued `organisationIds` as Mongo-style overlap (matches when any element is in the query array), great. If not, swap to a `ConditionsMatcher` with a custom predicate.

Test cases (3):
1. sysadmin gets unconditional manage
2. instructor with orgs `['A', 'B']` matches Student with `organisationIds: ['A', 'C']` (overlap on A); but NOT Student with `organisationIds: ['D']`
3. anonymous gets nothing

## Step 6: Module

```ts
@Module({
  controllers: [StudentsController],
  providers: [StudentsRepository, StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
```

ProgressModule is already loaded; ProgressService is `@Global`-imported via the existing wiring (or just imported normally — check the Phase 3 setup).

## Step 7: Verify + commit

```
pnpm --filter backend exec vitest run src/modules/students
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: 8 service + 3 ability = 11 new tests; total ~354 (343 + 11).

```
git add apps/backend/src/modules/students/
git commit -m "feat(students): repository + service + controller + ability + spec"
```

---

## Task 6: Backend — AppModule wiring + AbilityFactory + OpenAPI regen

**Files:**
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.factory.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Regenerated: `packages/contracts/openapi/openapi.{yaml,json}`

Mirror Phase 3 Task 4 (`ce0045a`).

- [ ] **Step 1**: AppModule imports `StudentsModule`.
- [ ] **Step 2**: AbilityFactory injects `@Optional() private readonly studentRules?: StudentAbilityRules` + appends to contributors.
- [ ] **Step 3**: AbilityModule lists `StudentAbilityRules` in providers.
- [ ] **Step 4**: Full backend suite + typecheck. Expected: ~354 still passing.
- [ ] **Step 5**: `pnpm openapi:generate`. Verify the new endpoints + schemas appear.
- [ ] **Step 6**: Commit.

```
git add apps/backend/src/app.module.ts apps/backend/src/infrastructure/ability/ packages/contracts/openapi/
git commit -m "feat(backend): wire StudentsModule + regen OpenAPI"
```

---

## Task 7: Frontend — `entities/me`

**Files (all new):**
- `apps/frontend/src/entities/me/api/me.api.ts`
- `apps/frontend/src/entities/me/api/me.api.test.ts`
- `apps/frontend/src/entities/me/lib/hooks.ts`
- `apps/frontend/src/entities/me/index.ts`

## Step 1: API

```ts
// me.api.ts
import { z } from 'zod';
import { MembershipRoleSchema } from '@repo/contracts/memberships';
import { httpClient } from '@/shared/api';

const MembershipRowSchema = z.object({
  organisationId: z.string().uuid(),
  role: MembershipRoleSchema,
});
const MembershipsResponseSchema = z.array(MembershipRowSchema);

export type Membership = z.infer<typeof MembershipRowSchema>;

export async function getMyMemberships(): Promise<Membership[]> {
  const raw = await httpClient('/api/me/memberships');
  return MembershipsResponseSchema.parse(raw);
}
```

## Step 2: Hook

```ts
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/me.api.js';

export const meKeys = {
  memberships: ['me', 'memberships'] as const,
};

export function useMyMembershipsQuery() {
  return useQuery({
    queryKey: meKeys.memberships,
    queryFn: () => api.getMyMemberships(),
    // Sidebar gating reads this — keep it fresh-enough but don't thrash.
    staleTime: 5 * 60 * 1000,
  });
}
```

## Step 3: Tests — 2 cases

- `getMyMemberships()` calls `/api/me/memberships`
- `getMyMemberships()` parses a returned array

Mock `@/shared/api`'s `httpClient` per the existing pattern.

## Step 4: Barrel + verify + commit

```
pnpm --filter frontend exec vitest run src/entities/me
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/entities/me/
git commit -m "feat(entities-me): /me/memberships API + hook"
```

---

## Task 8: Frontend — `entities/student`

**Files (all new):**
- `apps/frontend/src/entities/student/api/student.api.ts`
- `apps/frontend/src/entities/student/api/student.api.test.ts`
- `apps/frontend/src/entities/student/lib/hooks.ts`
- `apps/frontend/src/entities/student/index.ts`

Mirror `entities/progress` (Phase 3 `1beec58`) shape.

## Step 1: API

```ts
import { z } from 'zod';
import { StudentRosterRowSchema, type StudentRosterRow } from '@repo/contracts/students';
import { ProgressSchema, type Progress, type UpsertInstructorProgressInput } from '@repo/contracts/progress';
import { httpClient } from '@/shared/api';

const RosterSchema = z.array(StudentRosterRowSchema);
const ProgressListSchema = z.array(ProgressSchema);

export async function getStudents(): Promise<StudentRosterRow[]> {
  const raw = await httpClient('/api/students');
  return RosterSchema.parse(raw);
}

export async function getStudentProgress(userId: string): Promise<Progress[]> {
  const raw = await httpClient(`/api/students/${userId}/progress`);
  return ProgressListSchema.parse(raw);
}

export async function upsertStudentTechniqueProgress(
  userId: string,
  techniqueId: string,
  input: UpsertInstructorProgressInput,
): Promise<Progress> {
  const raw = await httpClient(`/api/students/${userId}/progress/techniques/${techniqueId}`, {
    method: 'PUT',
    body: input,
  });
  return ProgressSchema.parse(raw);
}

export async function upsertStudentPatternProgress(
  userId: string,
  patternId: string,
  input: UpsertInstructorProgressInput,
): Promise<Progress> {
  const raw = await httpClient(`/api/students/${userId}/progress/patterns/${patternId}`, {
    method: 'PUT',
    body: input,
  });
  return ProgressSchema.parse(raw);
}

export async function deleteStudentTechniqueProgress(userId: string, techniqueId: string): Promise<void> {
  await httpClient(`/api/students/${userId}/progress/techniques/${techniqueId}`, { method: 'DELETE' });
}

export async function deleteStudentPatternProgress(userId: string, patternId: string): Promise<void> {
  await httpClient(`/api/students/${userId}/progress/patterns/${patternId}`, { method: 'DELETE' });
}
```

## Step 2: Hooks

```ts
export const studentKeys = {
  list: ['student', 'list'] as const,
  progress: (userId: string) => ['student', 'progress', userId] as const,
};

export function useStudentsQuery() { /* useQuery on studentKeys.list */ }
export function useStudentProgressQuery(userId: string | null) { /* enabled: !!userId */ }
export function useUpsertStudentTechniqueProgressMutation() { /* invalidates ['student'] + ['progress'] */ }
// + 3 more mutations mirroring upsert/delete for both contentTypes
```

The mutation `onSuccess` should invalidate BOTH `['student']` (so the per-student progress list refetches) AND `['progress']` (so any self-view the student themselves has open updates).

## Step 3: Tests — 4 cases

Roster URL, per-student URL, upsert URL+body, delete URL+method.

## Step 4: Verify + commit

```
pnpm --filter frontend exec vitest run src/entities/student
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/entities/student/
git commit -m "feat(entities-student): roster + per-student progress API + hooks"
```

---

## Task 9: Frontend — update `ProgressEditorDialog` + new `StudentProgressEditorDialog`

**Files:**
- Modify: `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.tsx`
- Modify: `apps/frontend/src/features/progress-editor-dialog/ui/ProgressEditorDialog.test.tsx`
- Create: `apps/frontend/src/features/student-progress-editor-dialog/ui/StudentProgressEditorDialog.tsx`
- Create: `apps/frontend/src/features/student-progress-editor-dialog/ui/StudentProgressEditorDialog.test.tsx`
- Create: `apps/frontend/src/features/student-progress-editor-dialog/index.ts`
- Modify: `apps/frontend/src/entities/progress/api/progress.api.ts` + tests (rename `notes` field everywhere it appears in fixtures + mock calls)

## Step 1: Update `entities/progress` field rename

Rename `notes` → `studentNotes` in fixtures, mock-call assertions, and the upsert payload type usage. The Phase 3 client passed `notes`; now it passes `studentNotes`. The path is unchanged.

## Step 2: ProgressEditorDialog updates

- Rename the textarea label from `progress.notes` → `progress.studentNotes` ("My notes")
- The textarea now writes `studentNotes` to the upsert input
- Below the editable textarea, add a read-only section that renders `existing?.instructorNotes` when non-empty:

```tsx
{existing?.instructorNotes ? (
  <FormField>
    <Label>{t('progress.instructorNotes')}</Label>
    <p className="rounded-sm border border-outline-variant/40 bg-surface-container px-3 py-2 text-sm whitespace-pre-wrap">
      {existing.instructorNotes}
    </p>
  </FormField>
) : null}
```

Submit payload becomes `{ status, studentNotes, lastPracticedAt }` (not `notes`).

Update Phase 3 tests: change `notes` references to `studentNotes`.

## Step 3: StudentProgressEditorDialog (new)

Sibling of `ProgressEditorDialog`. Same structure, different data:

- Reads `useStudentProgressQuery(studentUserId)` (the per-student list); finds the row matching `contentType` + `contentId`. OR add a per-content single-row hook — simpler is to filter the list locally since the dialog only opens after the user clicked into a known row.
- Renders **`existing?.studentNotes`** as a read-only display.
- Renders **`instructorNotes`** as an editable textarea (writes `instructorNotes` to the upsert input).
- Status select + DatePicker as before.
- Submit calls `useUpsertStudentTechniqueProgressMutation` or pattern mirror.
- Reset calls `useDeleteStudent...ProgressMutation` with `window.confirm`.

Props:

```ts
export interface StudentProgressEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  contentType: ContentType;
  contentId: string;
  contentLabel?: string;
}
```

## Step 4: Tests

`StudentProgressEditorDialog.test.tsx` (3 cases per spec §11.2):
- Renders student notes read-only when set
- Submit calls upsert mutation with `{ status, instructorNotes, lastPracticedAt }`
- Reset (with confirmed window.confirm) calls delete mutation

Use the same pointer-capture jsdom stubs as `ProgressEditorDialog.test.tsx` (`hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView`).

## Step 5: Barrel + verify + commit

```
pnpm --filter frontend exec vitest run src/features/progress-editor-dialog src/features/student-progress-editor-dialog src/entities/progress
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/features/ apps/frontend/src/entities/progress/
git commit -m "feat(progress): split notes UX + StudentProgressEditorDialog"
```

---

## Task 10: Frontend — `/students` + `/students/:userId` pages + routes + sidebar entry

**Files:**
- Create: `apps/frontend/src/pages/students/` (page + test + barrel)
- Create: `apps/frontend/src/pages/student-detail/` (page + test + barrel)
- Create: `apps/frontend/src/app/router/routes/_app.students.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.students.$userId.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Auto-regen: `apps/frontend/src/app/router/routeTree.gen.ts`

## Step 1: StudentsPage

Flat table — Name · Email · Organisation(s) · 4 chips (one per status with the count). Click a row → navigate to `/students/:userId`.

Use TanStack Router's `useNavigate()` or a `<Link>` per row.

```tsx
const { data: students = [], isPending } = useStudentsQuery();
```

Empty state: `t('students.empty')`.

## Step 2: StudentDetailPage

URL param: `userId`. Render two sections (Techniques + Patterns) listing every technique/pattern with a `<ProgressPill>` per row.

```tsx
const { userId } = useParams({ from: '/_app/students/$userId' });
const { data: progress = [] } = useStudentProgressQuery(userId);
const { data: techniques = [] } = useTechniquesQuery([]);  // unfiltered list
const { data: patterns = [] } = usePatternsQuery([]);

const progressByContent = new Map(progress.map((p) => [p.techniqueId ?? p.patternId!, p]));

const [editing, setEditing] = React.useState<{ contentType: ContentType; contentId: string; label: string } | null>(null);
```

For each row, render `<ProgressPill status={progressByContent.get(row.id)?.status ?? null} onClick={() => setEditing({ contentType: 'technique', contentId: row.id, label: row.nameRomaji })} />`.

Mount `<StudentProgressEditorDialog>` at the page root when `editing` is non-null.

## Step 3: Routes

`_app.students.tsx`:

```tsx
import { createRoute } from '@tanstack/react-router';
import { StudentsPage } from '@/pages/students';
import { appLayoutRoute } from './_app.js';

export const studentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/students',
  component: StudentsPage,
});
export const Route = studentsRoute;
```

`_app.students.$userId.tsx`:

```tsx
import { createRoute } from '@tanstack/react-router';
import { StudentDetailPage } from '@/pages/student-detail';
import { appLayoutRoute } from './_app.js';

export const studentDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/students/$userId',
  component: StudentDetailPage,
});
export const Route = studentDetailRoute;
```

No `beforeLoad` gating — backend 403 surfaces as a query error and the page handles it (showing the friendly forbidden message).

## Step 4: Sidebar

In `AppSidebar.tsx`:

```tsx
import { GraduationCap } from 'lucide-react';
import { useMyMembershipsQuery } from '@/entities/me';

// inside component:
const { data: memberships = [] } = useMyMembershipsQuery();
const isInstructor = memberships.some((m) => m.role === 'instructor');
const showStudents = isInstructor || ability?.can('manage', 'User');

// In NAV rendering, add:
{showStudents ? (
  <SidebarMenuItem>
    <SidebarMenuButton asChild isActive={pathname.startsWith('/students')}>
      <Link to="/students">
        <GraduationCap />
        <span>{t('nav.students')}</span>
      </Link>
    </SidebarMenuButton>
  </SidebarMenuItem>
) : null}
```

Place it after `Grading history` in the main NAV.

## Step 5: routeTree.gen.ts

Hand-add the two new routes alongside the others. The file has `@ts-nocheck`.

## Step 6: Page tests

`StudentsPage.test.tsx` (2 cases):
- Renders roster rows from `useStudentsQuery` mock
- Clicking a row navigates to `/students/<that-id>` (mock `useNavigate`)

`StudentDetailPage.test.tsx` (2 cases):
- Renders techniques + patterns sections
- Clicking a pill opens the dialog (assert dialog content visible)

Mock the entity hooks. Stub `useParams` to return the test userId.

## Step 7: Verify + commit

```
pnpm --filter frontend exec vitest run src/pages/students src/pages/student-detail src/widgets/appsidebar
cd apps/frontend && npx tsc --noEmit
git add apps/frontend/src/pages/students/ apps/frontend/src/pages/student-detail/ \
        apps/frontend/src/app/router/routes/_app.students.tsx \
        apps/frontend/src/app/router/routes/_app.students.$userId.tsx \
        apps/frontend/src/app/router/routeTree.gen.ts \
        apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(students): /students + /students/:userId pages + sidebar entry"
```

---

## Task 11: i18n keys (en/sv/fi)

**Files:**
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

Mirror Phase 3 Task 10's pattern (`70f5386`).

### en.json

```json
"nav": { /* ... existing ... */, "students": "Students" },

"students": {
  "title": "Students",
  "description": "Browse and update progress for students in your organisations.",
  "empty": "No students yet.",
  "columns": {
    "name": "Name",
    "email": "Email",
    "organisations": "Organisations",
    "progress": "Progress"
  },
  "summary": {
    "notStarted": "Not started",
    "learning": "Learning",
    "competent": "Competent",
    "gradingReady": "Grading ready"
  },
  "detail": {
    "title": "{{name}}",
    "techniques": "Techniques",
    "patterns": "Patterns"
  },
  "errors": {
    "forbidden": "You don't have access to this student."
  }
},

// Inside the existing "progress" block, rename `notes` and add `instructorNotes`:
"progress": {
  // ... existing ...
  "studentNotes": "My notes",
  "instructorNotes": "Instructor notes"
}
```

(Remove the old `progress.notes` key OR leave it as `My notes` — your call. Recommend removing to keep the lexicon honest.)

### sv.json

```json
"nav.students": "Studenter",
"students.title": "Studenter",
"students.description": "Bläddra och uppdatera framsteg för studenter i dina organisationer.",
"students.empty": "Inga studenter ännu.",
"students.columns": { "name": "Namn", "email": "E-post", "organisations": "Organisationer", "progress": "Framsteg" },
"students.summary": { "notStarted": "Ej påbörjat", "learning": "Lär sig", "competent": "Behärskar", "gradingReady": "Redo för gradering" },
"students.detail": { "title": "{{name}}", "techniques": "Tekniker", "patterns": "Mönster" },
"students.errors": { "forbidden": "Du har inte åtkomst till denna student." },
"progress.studentNotes": "Mina anteckningar",
"progress.instructorNotes": "Instruktörsanteckningar"
```

### fi.json

```json
"nav.students": "Opiskelijat",
"students.title": "Opiskelijat",
"students.description": "Selaa ja päivitä organisaatioidesi opiskelijoiden edistymistä.",
"students.empty": "Ei opiskelijoita vielä.",
"students.columns": { "name": "Nimi", "email": "Sähköposti", "organisations": "Organisaatiot", "progress": "Edistyminen" },
"students.summary": { "notStarted": "Ei aloitettu", "learning": "Opiskelee", "competent": "Hallitsee", "gradingReady": "Valmis arviointiin" },
"students.detail": { "title": "{{name}}", "techniques": "Tekniikat", "patterns": "Kuviot" },
"students.errors": { "forbidden": "Sinulla ei ole pääsyä tähän opiskelijaan." },
"progress.studentNotes": "Omat muistiinpanot",
"progress.instructorNotes": "Ohjaajan muistiinpanot"
```

Tests that asserted raw `progress.notes` or raw key text need a quick regex update — same approach as Phase 1 + 2.

## Step 4: Commit

```
git add apps/frontend/src/i18n/locales/ apps/frontend/src/features/ apps/frontend/src/pages/
git commit -m "feat(i18n): students + progress notes split (en/sv/fi)"
```

---

## Task 12: Full pipeline + clean tree

**Files:** None modified — verification only.

- [ ] **Step 1**: Regenerate OpenAPI if needed.
- [ ] **Step 2**: Backend tests + typecheck. Expected: ~354+ passing, tsc exit 0.
- [ ] **Step 3**: Contracts tests + typecheck + build.
- [ ] **Step 4**: Frontend tests + typecheck + arch + build. Expected: tests pass (the usual `profile-form` + `organisation-form` parallel-load flake — re-run in isolation if it hits). Arch: 0 errors. Warnings will bump by ~3 for new slices.
- [ ] **Step 5**: Clean tree confirmation.

---

## Self-Review Notes

Spec coverage check:
- §4.1 notes split → Task 1 ✓
- §4.2 acting_user_id → Task 2 ✓
- §5 CASL Student → Tasks 3 + 5 ✓
- §6 REST API → Task 5 controller + Task 4 progress extension ✓
- §7 module shape → Task 5 ✓
- §7.1 ProgressService extension → Task 4 ✓
- §7.2 roster query → Task 5 repository ✓
- §8 frontend slices → Tasks 7-10 ✓
- §9 i18n → Task 11 ✓
- §10 migrations → Tasks 1, 2 ✓
- §11 testing → covered across all task specs ✓
- §12 acceptance criteria → backend + frontend specs cover all listed cases ✓

Placeholder scan: no TBDs. Where helper API depends on platform specifics (CASL `$in` array overlap), explicit fallback paths are given.

Type consistency:
- `studentNotes` + `instructorNotes` throughout the rename (Phase 3 had `notes`)
- `actingUserId` on RecordInput (mirrors the impersonation `impersonatedById` field)
- `UpsertInstructorProgressInput` distinct from `UpsertProgressInput`
- `StudentSubjectShape.organisationIds` array; the CASL conditional uses `$in` against it

Total task count: 12. Estimated commit count: 12-14.
