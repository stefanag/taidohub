# Techniques (Phase 3.5 — Instructor view of students' progress) Design

**Date:** 2026-06-12
**Status:** Approved

Lets instructors see and update progress for every student in the
organisations where they hold an `instructor` membership. Adds a
`/students` roster page, a per-student progress drill-down, and the
on-behalf-of write semantics with full audit attribution.

Phase 3 spec: `docs/superpowers/specs/2026-06-11-techniques-phase3-progress-design.md`.

## 1. Goal

Give instructors a useful coaching surface. Lists students by their
membership in instructor-led orgs. Shows each student's progress
catalogue. Allows instructor-side mutation (status + last-practiced +
instructor notes), with student notes preserved separately and
read-only to instructors.

## 2. Non-goals (Phase 3.5)

- Student-side notification when an instructor changes their progress.
- Optimistic concurrency / ETag on PUT — last-write-wins.
- Group views ("show me my class's progress on Maezuki").
- Filter / sort the roster by status.
- CSV export of student progress.
- Belt-rank context column on the roster.
- Rename `impersonated_by_id` on the existing audit log.
- Sysadmin embedded "Progress" tab inside the existing UserForm dialog —
  deferred. Sysadmin browses students via the same `/students` page.

## 3. Naming decisions

- New audit column: **`acting_user_id`** (generic; future on-behalf-of
  cases reuse it without semantic drift).
- New progress columns: **`student_notes`** + **`instructor_notes`**
  (existing `notes` dropped — no production data to preserve per the
  scoping decision).
- CASL subject: **`Student`**.
- URL paths: `/api/students`, `/api/students/:userId/...`, `/api/me/memberships`.
- Frontend slice: `entities/student`, `features/student-progress-editor-dialog`,
  `pages/students` + `pages/student-detail`.

## 4. Data model

### 4.1 Split `user_content_progress.notes` (migration 0022)

| operation |
|---|
| `ALTER TABLE user_content_progress DROP COLUMN notes;` |
| `ALTER TABLE user_content_progress ADD COLUMN student_notes text NOT NULL DEFAULT '';` |
| `ALTER TABLE user_content_progress ADD COLUMN instructor_notes text NOT NULL DEFAULT '';` |

Both default empty. Per the scoping decision the existing `notes`
content is dropped without copy.

### 4.2 New `audit_log.acting_user_id` column (migration 0023)

| column | type | notes |
|---|---|---|
| `acting_user_id` | text NULL FK → `user.id` ON DELETE SET NULL | the authenticated session that performed the action, when distinct from the row's subject AND not via session impersonation |

### 4.3 Audit cases summary

| Action | `user_id` | `impersonated_by_id` | `acting_user_id` |
|---|---|---|---|
| Student edits own progress | student | null | null |
| Instructor edits student's progress | student | null | instructor |
| Sysadmin impersonating, then edits | impersonated user | sysadmin | null |
| Instructor reviewing their own progress | instructor (self) | null | null |

Query "who actually pressed the button":
```sql
COALESCE(impersonated_by_id, acting_user_id, user_id)
```

## 5. CASL

### 5.1 New `Student` subject

```ts
export type StudentSubjectShape = {
  readonly __caslSubjectType__: 'Student';
  /**
   * Set of organisation ids the student is a member of. The instructor
   * rule matches when any element overlaps the instructor's instructor-
   * memberships.
   */
  organisationIds?: readonly string[];
};
```

### 5.2 Rules

```ts
// sysadmin: unconditional
builder.can('manage', 'Student');

// instructor: conditional on org overlap
const instructorOrgs = user.memberships
  .filter((m) => m.role === 'instructor')
  .map((m) => m.organisationId);
if (instructorOrgs.length > 0) {
  builder.can('manage', 'Student', { organisationIds: { $in: instructorOrgs } });
}
```

**CASL `$in` semantics on an array field:** matches when ANY element of
`organisationIds` matches ANY value in `instructorOrgs`. That's the
overlap check we want.

**Verification:** during implementation, write a unit test that instantiates
the conditional ability and confirms a Student with
`organisationIds: ['A', 'C']` IS allowed when the instructor has
`instructorOrgs: ['B', 'C']`. If `$in` doesn't behave as MongoDB-style
overlap (CASL versions vary), the fallback is a custom condition
predicate via `ConditionsMatcher`. The plan flags this for the implementer.

### 5.3 Authorisation flow

1. Controller receives `/api/students/:userId/...`.
2. Service loads the student's org memberships → builds the
   `Student` subject instance with `organisationIds`.
3. `ability.can('manage', studentSubject)` decides 200 vs 403.

No CASL change to `Progress` — instructor writes go through `Student`
gating, then the service forwards to a new `ProgressService` overload
that accepts a separate `subjectUserId`.

## 6. REST API

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `GET` | `/me/memberships` | any authenticated | returns `[{ organisationId, role }]` for sidebar gating |
| `GET` | `/students` | `ability.can('read', 'Student')` (sysadmin OR any instructor) | flat list of students in the caller's instructor orgs. Sysadmin sees all. Each row: `{ userId, name, email, organisations: [{ id, name }], progressSummary: { not_started, learning, competent, grading_ready } }` |
| `GET` | `/students/:userId/progress` | row-level `manage` Student check | returns `Progress[]` for the named student |
| `PUT` | `/students/:userId/progress/techniques/:techniqueId` | row-level `manage` Student check | upsert. Body = `UpsertInstructorProgressInput` (status + lastPracticedAt + instructorNotes). Does NOT touch studentNotes. |
| `PUT` | `/students/:userId/progress/patterns/:patternId` | mirror | |
| `DELETE` | `/students/:userId/progress/techniques/:techniqueId` | mirror | reset (delete row) |
| `DELETE` | `/students/:userId/progress/patterns/:patternId` | mirror | |

### 6.1 New Zod schemas

```ts
// packages/contracts/src/progress.ts — updated
export const ProgressSchema = z.object({
  // … existing fields …
  studentNotes: z.string(),     // renamed from `notes`
  instructorNotes: z.string(),  // new
  // … existing fields …
});

export const UpsertProgressSchema = z.object({
  status: ProgressStatusSchema,
  studentNotes: z.string().max(2000).default(''),   // renamed
  lastPracticedAt: IsoDate.nullable().optional(),
}).meta({ id: 'UpsertProgressInput' });  // student endpoints — only touches student_notes + status + date

export const UpsertInstructorProgressSchema = z.object({
  status: ProgressStatusSchema,
  instructorNotes: z.string().max(2000).default(''),
  lastPracticedAt: IsoDate.nullable().optional(),
}).meta({ id: 'UpsertInstructorProgressInput' });
```

Student's PUT can touch only `student_notes`. Instructor's PUT can
touch only `instructor_notes`. Both can write `status` and
`lastPracticedAt`. Audit captures whichever side fired.

### 6.2 Student roster shape

```ts
export const StudentRosterRowSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  organisations: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
  })),
  progressSummary: z.object({
    not_started: z.number().int().nonnegative(),
    learning: z.number().int().nonnegative(),
    competent: z.number().int().nonnegative(),
    grading_ready: z.number().int().nonnegative(),
  }),
}).meta({ id: 'StudentRosterRow' });
```

### 6.3 Membership shape (for `/me/memberships`)

Already covered by the existing `Membership` contract in
`packages/contracts/src/memberships.ts`. The endpoint returns a subset:
`[{ organisationId, role }]`.

## 7. Backend module shape

```
apps/backend/src/modules/students/
  students.repository.ts          # roster query, org-overlap query
  students.service.ts             # list + per-student progress + on-behalf-of writes
  students.service.spec.ts
  students.controller.ts          # 7 endpoints (6 students + 1 me/memberships)
  students.module.ts
  students.ability-rules.ts       # Student CASL subject
  students.ability-rules.spec.ts
```

The `/me/memberships` endpoint piggybacks on this controller for
locality (it's tied to the same "who do I know?" intent), even though
the path isn't under `/students`. Alternative: split into a
`MeController` if the team prefers — out of scope for the design.

### 7.1 ProgressService extension

```ts
// New methods on ProgressService (no DI change):
async upsertOnBehalfOf(
  actor: AuthenticatedUser,           // instructor
  subjectUserId: string,              // student
  contentType: ContentType,
  contentId: string,
  input: UpsertInstructorProgressInput,
): Promise<Progress>;

async deleteOnBehalfOf(
  actor: AuthenticatedUser,
  subjectUserId: string,
  contentType: ContentType,
  contentId: string,
): Promise<void>;
```

Behaviour mirrors `upsert` / `delete` exactly, with two differences:
- The progress row's `user_id` is `subjectUserId`, not `actor.id`.
- The audit row gets `user_id = subjectUserId`, `acting_user_id = actor.id`.
- `studentNotes` is NEVER touched — only `instructorNotes` + status + date.

Self-scoped `upsert` / `delete` retain their existing signature. Audit
rows continue to use `acting_user_id = null` (the actor IS the subject).

### 7.2 Roster query

```sql
SELECT
  u.id, u.name, u.email,
  json_agg(json_build_object('id', o.id, 'name', o.name)) AS organisations,
  COALESCE(COUNT(*) FILTER (WHERE p.status = 'not_started'),   0) AS not_started,
  COALESCE(COUNT(*) FILTER (WHERE p.status = 'learning'),      0) AS learning,
  COALESCE(COUNT(*) FILTER (WHERE p.status = 'competent'),     0) AS competent,
  COALESCE(COUNT(*) FILTER (WHERE p.status = 'grading_ready'), 0) AS grading_ready
FROM "user" u
JOIN organisation_membership m ON m.user_id = u.id
JOIN organisations o ON o.id = m.organisation_id
LEFT JOIN user_content_progress p ON p.user_id = u.id
WHERE m.organisation_id IN (<instructor's instructor-org ids>)
GROUP BY u.id, u.name, u.email;
```

Sysadmin gets the same shape but without the WHERE filter.

## 8. Frontend

### 8.1 New entity slices

```
entities/me/
  api/me.api.ts           # getMyMemberships(): Promise<Membership[]>
  api/me.api.test.ts
  lib/hooks.ts            # useMyMembershipsQuery
  index.ts
```

```
entities/student/
  api/student.api.ts      # getStudents, getStudentProgress, upsertStudentTechniqueProgress, ...
  api/student.api.test.ts
  lib/hooks.ts
  index.ts
```

### 8.2 New feature slice

```
features/student-progress-editor-dialog/
  ui/StudentProgressEditorDialog.tsx
  ui/StudentProgressEditorDialog.test.tsx
  index.ts
```

Same dialog shape as `ProgressEditorDialog` (Phase 3), with:
- Two textareas instead of one: "Student notes" (read-only) +
  "Instructor notes" (editable).
- Submit hits the instructor endpoint.
- Reset hits the instructor delete endpoint.

The existing `ProgressEditorDialog` is also updated:
- Renames the textarea to "My notes" (writes `studentNotes`).
- Adds a read-only "Instructor notes" section below, shown only when
  it has content.

### 8.3 New pages

- `apps/frontend/src/pages/students/ui/StudentsPage.tsx` — roster.
  Flat table: Name · Email · Organisation(s) · 4 progress count chips.
  Click → navigate to `/students/:userId`.
- `apps/frontend/src/pages/student-detail/ui/StudentDetailPage.tsx` —
  per-student catalogue. Two sections:
  - Techniques (with progress pills per row)
  - Patterns (with progress pills per row)
  - Clicking a pill opens `StudentProgressEditorDialog` for that
    (studentUserId, contentType, contentId).

### 8.4 Routes

- `_app.students.tsx` — gated by `ability?.can('read', 'Student')` —
  but frontend CASL doesn't know memberships yet (Phase 1 caveat).
  Practical gating: redirect-on-403 from the controller. Sidebar
  visibility is gated by `useMyMembershipsQuery()` returning at least
  one `'instructor'` row OR by `user.role === 'sysadmin'`.
- `_app.students.userId.tsx` — same `beforeLoad` gating; backend will
  403 on `getStudentProgress` if the caller isn't authorised.

### 8.5 Sidebar entry

In `AppSidebar.tsx`:

```tsx
const { data: memberships = [] } = useMyMembershipsQuery();
const isInstructor = memberships.some((m) => m.role === 'instructor');
const showStudents = isInstructor || ability?.can('manage', 'User');

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

Lives in the main NAV (instructor doesn't necessarily have admin
privileges; sysadmin sees admin cluster anyway).

## 9. i18n

```
nav.students                          # "Students"

students.title                        # "Students"
students.description                  # "Browse and update progress for students in your organisations."
students.empty                        # "No students yet."

students.columns.name                 # "Name"
students.columns.email                # "Email"
students.columns.organisations        # "Organisations"
students.columns.progress             # "Progress"

students.summary.notStarted           # "Not started"
students.summary.learning             # "Learning"
students.summary.competent            # "Competent"
students.summary.gradingReady         # "Grading ready"

students.detail.title                 # "{{name}}"
students.detail.techniques            # "Techniques"
students.detail.patterns              # "Patterns"

students.errors.forbidden             # "You don't have access to this student."

progress.studentNotes                 # "My notes"        (renamed from progress.notes)
progress.instructorNotes              # "Instructor notes"
```

Sv + Fi follow the same shape. Plan §Task 10 will have the literals.

## 10. Migrations

Two additive (one with a drop, but no data preservation needed):

- **0022** — `user_content_progress`: drop `notes`, add
  `student_notes text NOT NULL DEFAULT ''` and `instructor_notes text
  NOT NULL DEFAULT ''`. Per the scoping decision the existing `notes`
  data is dropped without copy.
- **0023** — `audit_log`: add `acting_user_id text NULL` FK → `user.id`
  ON DELETE SET NULL.

## 11. Testing

### 11.1 Backend

- `students.service.spec.ts` (8 cases):
  1. roster lists students from caller's instructor orgs only
  2. sysadmin gets unfiltered roster
  3. caller with no instructor memberships gets 403 on roster
  4. `getStudentProgress` 403s when target student not in any of
     caller's instructor orgs
  5. `upsertOnBehalfOf` writes `instructor_notes` only (doesn't touch
     `student_notes`)
  6. `upsertOnBehalfOf` writes audit row with `acting_user_id` set
  7. `deleteOnBehalfOf` cascades and writes audit
  8. CASL: instructor with org `A` can manage Student with
     `organisationIds: ['A', 'B']` but not `organisationIds: ['B']`
- `students.ability-rules.spec.ts` (3 cases): sysadmin manage all;
  instructor conditional manage; anonymous nothing.
- `me.spec.ts` (2 cases): returns the caller's memberships; empty array
  for users without any.
- Existing `progress.service.spec.ts` updates: assert new column names
  on the audit snapshot.

### 11.2 Frontend

- `student.api.test.ts` (4 cases): roster URL, per-student URL,
  upsert+delete URLs.
- `me.api.test.ts` (1 case): `/api/me/memberships`.
- `StudentProgressEditorDialog.test.tsx` (3 cases): renders student
  notes read-only; submit hits instructor endpoint; reset calls instructor
  delete.
- `StudentsPage.test.tsx` (2 cases): renders roster rows; clicking a
  row navigates to `/students/:userId`.
- `StudentDetailPage.test.tsx` (2 cases): renders techniques and
  patterns sections; clicking a pill opens the dialog.

## 12. Acceptance criteria

1. POST a fresh user; assign instructor membership in org A; create a
   second user with membership in org A. Caller as instructor:
   `GET /api/students` returns the second user.
2. Same instructor caller: `GET /api/students/<second user's id>/progress`
   returns 200.
3. Same instructor caller: `PUT /api/students/<second user's id>/progress/techniques/<existing technique id>`
   with `{ status: 'competent', instructorNotes: 'great kick' }` →
   200; the row has `status='competent'`, `instructor_notes='great kick'`,
   `student_notes=''` (untouched). Audit row has
   `user_id = student`, `acting_user_id = instructor`.
4. Student (self) `PUT /api/progress/techniques/<id>` with
   `{ studentNotes: 'I'm confused' }` → row updates `student_notes`
   only; `instructor_notes` unchanged.
5. Instructor in org B (not org A) `GET /api/students/<our second user>/progress`
   → 403.
6. `GET /api/me/memberships` returns the caller's membership array.
7. Frontend: sidebar shows "Students" entry when
   `useMyMembershipsQuery()` includes any instructor role.
8. Frontend: opening `StudentProgressEditorDialog` shows student notes
   as read-only and instructor notes as editable; saving updates only
   `instructor_notes`.
9. CASL: regular user with no instructor membership cannot
   `read Student` (sidebar hidden + backend 403).

## 13. Deploy

1. Apply migration 0022 (progress notes split).
2. Apply migration 0023 (audit log `acting_user_id`).
3. Backend release (StudentsModule + ProgressService extension + Me endpoint).
4. Frontend release (entity slices + dialog updates + pages + sidebar entry).

Brief overlap: frontend-first would see 404s on `/api/students`. No
data risk.

## 14. Task summary

12 tasks (see plan):

1. DB: split `user_content_progress.notes` → `student_notes` + `instructor_notes` (migration 0022)
2. DB: add `audit_log.acting_user_id` (migration 0023)
3. Contracts: update `ProgressSchema` (rename `notes` → `studentNotes`, add `instructorNotes`); add `UpsertInstructorProgressSchema`, `StudentRosterRowSchema`; new CASL `Student` subject
4. Backend: extend `ProgressService` with `upsertOnBehalfOf` / `deleteOnBehalfOf` + adjust audit writes + spec updates
5. Backend: `StudentsModule` (repo + service + roster query + controller + ability + spec)
6. Backend: `MeController` (or `/me/memberships` endpoint inside StudentsController) + spec
7. Backend: AppModule wiring + AbilityFactory + OpenAPI regen
8. Frontend: `entities/me` + `useMyMembershipsQuery` + tests
9. Frontend: `entities/student` API + hooks + tests
10. Frontend: update `ProgressEditorDialog` for split notes; add `StudentProgressEditorDialog`
11. Frontend: `/students` + `/students/:userId` pages + routes + sidebar entry
12. i18n + full pipeline

May stretch to 13 if the CASL `$in` overlap behaviour requires a
custom matcher.
