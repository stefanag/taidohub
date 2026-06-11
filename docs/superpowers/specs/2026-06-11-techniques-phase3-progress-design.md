# Techniques (Phase 3 — Progress tracking) Design

**Date:** 2026-06-11
**Status:** Approved

Per-user progress tracking against techniques + patterns. Single polymorphic
table with a 4-state status enum, optional notes, optional last-practiced
date. Status pill on every catalogue row; click to open an editor dialog.

Originating spec: user-pasted "Techniques + Patterns with Many-to-Many
Categories" (out-of-codebase). Phase 1 spec:
`docs/superpowers/specs/2026-06-10-techniques-phase1-design.md`. Phase 2
spec: `docs/superpowers/specs/2026-06-10-techniques-phase2-patterns-design.md`.

Phase 3 implements the originating spec's progress slice only. Practice log
and media attachments are deferred — see §2.

## 1. Goal

Let every authenticated user track their own learning progress on each
technique + pattern. Status is one of `not_started`, `learning`,
`competent`, `grading_ready`. The pill appears inline on catalogue rows;
clicking it opens a dialog with status, notes, and an optional
last-practiced date.

## 2. Non-goals (Phase 3)

- Pattern practice log (deferred to a future series).
- Media attachments to techniques / patterns (deferred — needs a storage-
  backend decision).
- A dedicated `/progress` dashboard page — catalogue pills are the
  surface; a summary page is a polish pass.
- Instructor / orgadmin visibility into students' progress — deferred to
  a future "instructor sees students" feature.
- Bulk progress edits.
- Status history / changelog (only the current status persists).
- Importing existing progress from external systems.

## 3. Naming decisions

- Table name: `user_content_progress` (matches the originating spec).
- CASL subject: `Progress`.
- Status enum: `not_started`, `learning`, `competent`, `grading_ready`.
- URL paths: per-content-type (`/progress/techniques/:id`,
  `/progress/patterns/:id`).
- Frontend FSD slices: `entities/progress`, `features/progress-editor-dialog`,
  `shared/ui/progress-pill`.

## 4. Data model

### 4.1 `user_content_progress` (new table, migration 0021)

| column | type | notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom` |
| `user_id` | text NOT NULL FK → `user.id` ON DELETE CASCADE | per-user; `user.id` is `text` in this codebase |
| `content_type` | text NOT NULL | enum `'technique' \| 'pattern'` — enforced by CHECK |
| `technique_id` | uuid NULL FK → `technique.id` ON DELETE CASCADE | populated when `content_type='technique'` |
| `pattern_id` | uuid NULL FK → `pattern.id` ON DELETE CASCADE | populated when `content_type='pattern'` |
| `status` | text NOT NULL | enum `'not_started' \| 'learning' \| 'competent' \| 'grading_ready'` — enforced by CHECK |
| `notes` | text NOT NULL DEFAULT `''` | user's private notes; max 2000 chars (Zod) |
| `last_practiced_at` | date NULL | nullable; stored as date type |
| `created_at`, `updated_at` | timestamp with timezone, mode 'date' | `defaultNow()` |

### 4.2 Constraints

**Polymorphic-FK CHECK** (DB trigger):

```sql
CHECK (
  (content_type = 'technique' AND technique_id IS NOT NULL AND pattern_id IS NULL)
  OR
  (content_type = 'pattern' AND pattern_id IS NOT NULL AND technique_id IS NULL)
)
```

**Status CHECK**:

```sql
CHECK (status IN ('not_started', 'learning', 'competent', 'grading_ready'))
```

**Two partial unique indexes** — one progress row per user per content
item:

```sql
CREATE UNIQUE INDEX user_content_progress_user_technique_uniq
  ON user_content_progress (user_id, technique_id)
  WHERE technique_id IS NOT NULL;

CREATE UNIQUE INDEX user_content_progress_user_pattern_uniq
  ON user_content_progress (user_id, pattern_id)
  WHERE pattern_id IS NOT NULL;
```

**Index for the "list my progress" query**:

```sql
CREATE INDEX user_content_progress_user_idx ON user_content_progress (user_id);
```

### 4.3 No `last_status` history

Phase 3 stores only the current status. A status change overwrites the
previous one. If a future need for changelog emerges, the audit log
service already captures every PUT — that's the historical record.

## 5. CASL

New subject `Progress` with conditional rules.

```ts
export type ProgressSubjectShape = {
  readonly __caslSubjectType__: 'Progress';
  /** Scopes regular users to their own rows. */
  userId?: string;
};
```

Rules:

- **sysadmin**: `manage` (any row — debug/support).
- **regular user / orgadmin / instructor / anonymous-authenticated**:
  `manage` rows where `userId === caller.id` (conditional).
  Orgadmins do NOT get visibility into their members' rows in Phase 3.
- **anonymous (no session)**: nothing.

The conditional `userId` filter means a non-sysadmin literally cannot read
another user's row — service-level + CASL both reject.

## 6. REST API

All paths prefixed with `/api/` by the global Nest prefix.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/progress` | any authenticated | lists current user's progress rows. `?contentType=technique\|pattern` optional filter. |
| `GET` | `/progress/techniques/:techniqueId` | any authenticated | single row for the current user + the given technique. 404 if no row exists. |
| `GET` | `/progress/patterns/:patternId` | any authenticated | mirror |
| `PUT` | `/progress/techniques/:techniqueId` | any authenticated | upsert. Body: `{ status, notes?, lastPracticedAt? }`. Creates a row if absent; replaces fields if present. |
| `PUT` | `/progress/patterns/:patternId` | any authenticated | mirror |
| `DELETE` | `/progress/techniques/:techniqueId` | any authenticated | "reset progress" — deletes the row. 404 if no row. |
| `DELETE` | `/progress/patterns/:patternId` | any authenticated | mirror |

### 6.1 Error cases

- Invalid `techniqueId` / `patternId` uuid (or no matching content row):
  `404 INVALID_CONTENT { message, details: { offendingId, contentType } }`.
  Matches the originating spec's wording.
- Missing fields in PUT body that Zod requires: `400 VALIDATION_ERROR`
  with Zod's flat shape (existing pattern from `AllExceptionsFilter`).
- Non-current-user trying to access via the service (shouldn't happen
  with the controller path design, but if it did): CASL would reject as
  `403 FORBIDDEN`.

### 6.2 Hydrated read shape

```ts
type ProgressRead = {
  id: string;
  userId: string;
  contentType: 'technique' | 'pattern';
  techniqueId: string | null;
  patternId: string | null;
  status: 'not_started' | 'learning' | 'competent' | 'grading_ready';
  notes: string;
  lastPracticedAt: string | null;  // ISO date 'YYYY-MM-DD' or null
  createdAt: string;
  updatedAt: string;
};
```

The list endpoint returns `ProgressRead[]` (small enough to not need
pagination in Phase 3 — typical user will have at most a few hundred
rows; a Phase 4 polish pass can add `?page`/`?perPage` if needed).

## 7. Backend module shape

```
apps/backend/src/modules/progress/
  progress.repository.ts                 # Drizzle CRUD + upsert
  progress.service.ts                    # upsert / delete / list with CASL self-scope
  progress.service.spec.ts
  progress.controller.ts                 # per-content-type PUT/GET/DELETE + list
  progress.module.ts
  progress.ability-rules.ts
  progress.ability-rules.spec.ts
```

### 7.1 Upsert semantics

`PUT /progress/techniques/:id` (and pattern mirror):

1. Validate the content (technique row exists, is active or not — both
   allowed; rejecting only on FK violation surfaces a different error
   shape, so service explicitly checks existence and throws
   `INVALID_CONTENT` 404 when missing).
2. Read existing row by `(user_id, technique_id)`.
3. If row exists: update `status`, `notes`, `last_practiced_at`,
   `updated_at`. Don't touch `created_at`.
4. If row absent: insert with `content_type='technique'`, `technique_id=:id`,
   `pattern_id=NULL`, fresh `id`, `created_at` = `updated_at` = now.
5. Emit audit log row (`entity_type='progress'`, `entity_id=<row.id>`,
   `user_id=actor.id`, `impersonated_by_id=actor.impersonatedBy ?? null`).

All inside a single Drizzle transaction.

### 7.2 Delete semantics

Find the row by `(user_id, content_id)` for the current user. If absent →
404. Delete + audit. Single transaction.

### 7.3 Self-scope on list

`GET /progress` always filters `WHERE user_id = actor.id` regardless of
caller's role. The `?userId=...` query param does NOT exist in Phase 3 —
keeps the surface minimal and safe.

## 8. Contracts (Zod)

`packages/contracts/src/progress.ts`:

```ts
import { z } from 'zod';

export const PROGRESS_STATUSES = ['not_started', 'learning', 'competent', 'grading_ready'] as const;
export const ProgressStatusSchema = z.enum(PROGRESS_STATUSES);
export type ProgressStatus = z.infer<typeof ProgressStatusSchema>;

export const CONTENT_TYPES = ['technique', 'pattern'] as const;
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  contentType: ContentTypeSchema,
  techniqueId: z.string().uuid().nullable(),
  patternId: z.string().uuid().nullable(),
  status: ProgressStatusSchema,
  notes: z.string(),
  lastPracticedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'Progress', description: 'Per-user progress on a single technique or pattern.' });

export const UpsertProgressSchema = z.object({
  status: ProgressStatusSchema,
  notes: z.string().max(2000).default(''),
  lastPracticedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).meta({ id: 'UpsertProgressInput', description: 'Body for PUT /api/progress/{contentType}/:id.' });

export type Progress = z.infer<typeof ProgressSchema>;
export type UpsertProgressInput = z.infer<typeof UpsertProgressSchema>;

export const ProgressOpenApiRegistry = {
  Progress: ProgressSchema,
  UpsertProgressInput: UpsertProgressSchema,
} as const;
```

CASL: `Progress` added to `SubjectSchema` before `'all'`; `ProgressSubjectShape`
exported as above.

## 9. Frontend

### 9.1 New entity slice

```
apps/frontend/src/entities/progress/
  api/progress.api.ts            # getProgressList, getTechniqueProgress, getPatternProgress, upsertTechniqueProgress, upsertPatternProgress, deleteTechniqueProgress, deletePatternProgress
  api/progress.api.test.ts
  lib/hooks.ts                   # useProgressListQuery, useTechniqueProgressQuery, ..., useUpsertTechniqueProgressMutation, etc.
  index.ts
```

### 9.2 New shared primitive

`apps/frontend/src/shared/ui/progress-pill.tsx` — a clickable, coloured
chip showing the current status. Status palette uses MD3 brand tokens:

- `not_started` → outline (gray, low-emphasis)
- `learning` → primary-container (navy tint)
- `competent` → secondary-container (gold tint)
- `grading_ready` → success-container (green) — or fall back to a green
  Tailwind utility if `--color-success-container` isn't in the project's
  brand tokens

The pill takes `status: ProgressStatus | null` (null = "not started"
display) + `onClick: () => void` props. Pure presentation.

### 9.3 New feature slice

`apps/frontend/src/features/progress-editor-dialog/`:

```tsx
export interface ProgressEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: 'technique' | 'pattern';
  contentId: string;
  /** Display label for the dialog title (e.g. technique nameRomaji). */
  contentLabel?: string;
}
```

Internally fetches the current progress (`useTechniqueProgressQuery` or
the pattern equivalent), shows:
- Status `<Select>` — 4 options
- Notes `<textarea>` (matches the technique-form inline style)
- Last practiced `<DatePicker>` — optional; can be cleared
- "Save" button → calls upsert mutation
- "Reset progress" button (only visible when a row exists) → calls
  delete mutation with `window.confirm` guard

Submit closes the dialog; React Query invalidation refreshes the pill.

### 9.4 Wire pills into catalogue rows

`TechniquesPage` + `AdminTechniquesPage` + `PatternsPage` +
`AdminPatternsPage` rows get a `<ProgressPill>` rendered with the row's
content id. Click handler opens `ProgressEditorDialog` with that
content id.

State management at the page level:
```tsx
const [editing, setEditing] = React.useState<{ contentType: 'technique'; contentId: string; label?: string } | null>(null);
```

Single dialog per page; opens with the clicked row's info, closes on
save / cancel / outside-click.

### 9.5 Bulk progress lookup

To render N pills on a page without N round trips, the pages call
`useProgressListQuery()` once and build a `Map<contentId, Progress>`.
Each pill receives `status` from that map (or null when absent =
"not started").

The hook caches per content type:

```ts
const { data: allProgress = [] } = useProgressListQuery();
const progressByContentId = React.useMemo(
  () => new Map(allProgress.map((p) => [p.techniqueId ?? p.patternId!, p])),
  [allProgress],
);
```

This is one HTTP call per page load, regardless of row count.

## 10. i18n

`apps/frontend/src/i18n/locales/{en,sv,fi}.json` gain:

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

Swedish + Finnish translations follow the same shape — see plan §Task 10
for the literal strings.

## 11. Migration

One additive migration:

- **0021** — `CREATE TABLE user_content_progress` + CHECK constraints +
  partial unique indexes + standard `(user_id)` index. Purely additive.

Apply via:
```
pnpm --filter backend run db:migrate
```

## 12. Testing

### 12.1 Backend

- `progress.service.spec.ts` (8 cases):
  1. upsert creates a new row when none exists
  2. upsert updates an existing row (idempotent — same `id`, fresh `updated_at`)
  3. upsert rejects unknown techniqueId → INVALID_CONTENT 404
  4. delete removes the row when it exists
  5. delete 404s when the row is absent
  6. list returns only the caller's rows
  7. CASL: regular user can `manage` own rows but not another user's
  8. CASL: sysadmin can `manage` all rows
- `progress.ability-rules.spec.ts` (3 cases):
  1. sysadmin gets manage all
  2. regular user gets conditional manage (own only)
  3. anonymous gets nothing

### 12.2 Frontend

- `progress.api.test.ts` (4 cases — `getProgressList`,
  `upsertTechniqueProgress`, `deletePatternProgress`,
  `getTechniqueProgress` 404 handling).
- `ProgressPill.test.tsx` (2 cases — renders status label,
  click handler fires).
- `ProgressEditorDialog.test.tsx` (3 cases — renders status select,
  submit calls upsert with the right payload, reset calls delete with
  confirm).
- Updates to `TechniquesPage.test.tsx` / `PatternsPage.test.tsx`:
  pills render per row (mock the bulk-list query).

## 13. Acceptance criteria

1. POST a fresh user. GET `/progress` returns `[]`.
2. PUT `/progress/techniques/<existing-uuid>` with `{ status: 'learning' }`
   → 200 + body with `id` + `status: 'learning'` + `lastPracticedAt: null`.
3. PUT same path again with `{ status: 'competent', lastPracticedAt: '2026-06-11' }`
   → 200, same `id`, status updated.
4. PUT `/progress/techniques/<unknown-uuid>` → 404 INVALID_CONTENT.
5. DELETE `/progress/techniques/<id-with-row>` → 204; subsequent GET
   for same techniqueId → 404.
6. GET `/progress` returns all current user's rows (mixed techniques +
   patterns) — and only those.
7. As user A, attempt to read user B's row via the service layer → CASL
   throws Forbidden. (Test via the spec; the controller never exposes a
   query param for `userId`.)
8. Delete a technique that has progress rows → cascades. Progress rows
   for that technique disappear.
9. Frontend: pill renders correct colour + label for each of the 4
   statuses.
10. Frontend: clicking a pill opens the dialog pre-filled with the row's
    data (or empty for "not started"). Saving with a new status closes
    the dialog and the pill updates without a manual refresh.
11. Frontend: "Reset progress" with confirm → DELETE; pill returns to
    "not started".

## 14. Task summary

11 tasks (see plan):

1. DB: `user_content_progress` table + CHECK + partial unique indexes + migration 0021
2. Contracts: progress Zod schemas + `Progress` CASL subject + `ProgressStatus` enum
3. Backend: `ProgressModule` (repo + service + controller + ability + spec)
4. Backend: AppModule wiring + AbilityFactory + OpenAPI regen
5. Frontend: `entities/progress` API + hooks
6. Frontend: `ProgressPill` shared primitive
7. Frontend: `ProgressEditorDialog` feature
8. Frontend: wire pills into TechniquesPage + AdminTechniquesPage rows
9. Frontend: wire pills into PatternsPage + AdminPatternsPage rows
10. i18n keys (en/sv/fi)
11. Full pipeline + clean tree

May stretch to 12 if pill colour tokens need fallbacks.

## 15. Deploy

1. Apply migration 0021 (additive).
2. Backend release (ProgressModule).
3. Frontend release (entities + pills + dialog + page wiring + i18n).

Frontend-first would 404 on the progress endpoints — acceptable for
the brief overlap.
