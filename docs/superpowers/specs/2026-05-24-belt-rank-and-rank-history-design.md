# Belt-Rank Catalog + Verified Grading History — Design

**Status:** proposed design — not yet approved.

**Date:** 2026-05-24

**Author:** Stefan (with Claude)

**Context:** taidohub needs a belt-rank catalog (systems → ranks → optional
shogo titles) and a verified, per-user grading history that unifies two
sources: rows mirrored from grading events (a separate, unbuilt workflow) and
manually recorded external entries. Verifier roles include sysadmins, head
instructors, linked instructors, and grading officers capped by system + rank.

Several pieces of infrastructure this spec relies on do not exist yet
(`grading_events`, `instructor_students`, `grading_officers`,
`grading_officer_systems`, `user_profile.current_rank_id`/`shogo_title`, a
feature-flag system, and the right-rail sidebar cards). They are enumerated
with sketches in the companion document
[`2026-05-24-belt-rank-followup-dependencies.md`](./2026-05-24-belt-rank-followup-dependencies.md).
This proposal defines the full end-state of the belt-rank + rank-history
surface; the eventual implementation plan can phase the work (catalog admin →
external rank-history MVP → verification → event sourcing) against the
followup-tracker as those pieces land.

---

## 1. Goals

- A localised **belt catalog** (systems, ranks, shogo titles) administered by
  sysadmins; ranks carry a colour, optional image, optional age requirement,
  optional `next_rank_id` override, and an opt-in public requirements page.
- A unified **rank history** per user: each grading is one row, sourced from
  either a grading event (`source='event'`) or a manual external entry
  (`source='external'`). Both pass and fail results land in the same log.
- **Verification workflow** for external entries (event-sourced rows are
  implicitly verified at insert and immutable through this API). Multiple
  verifier roles (sysadmin, head instructor, linked instructor, capped grading
  officer); the recorder cannot verify their own row.
- **Shogo title recompute**: verifying or unverifying a row whose shogo title
  changes the user's currently-displayed shogo recalculates it as the highest
  verified shogo across their history.
- **Unified read projection** (`GET /api/grading-events/history/:userId`) that
  hydrates examiner/organisation fields and computes per-row `canVerify` /
  `canEdit` flags for the UI, with the actor's role lookups batched once per
  request.
- **Frontend**: a self-service grading history page with a vertical timeline
  and right-rail context cards; a modal for adding/editing external entries
  (gated by `grading-history`); verify/unverify actions (gated by
  `grading-history-verification`); a `BeltGraphic` component for the visual
  rendering.

## 2. Non-goals (v1)

- **Grading-event workflow.** Event-sourced rows are read here, but creating,
  editing, or running grading events is out of scope. The followup tracker
  carries that work.
- **Public requirements page.** `belt_ranks.publicly_visible` + `slug` are
  schema-ready; the public page itself is a separate surface.
- **Notifications.** No emails or in-app pings on verification.
- **Audit log.** External entry create / edit / verify / unverify are
  deliberately NOT written to the audit log in v1; lifecycle visibility lives
  in the row itself (`recordedByUserId`, `verifiedByUserId`, `updatedByUserId`,
  timestamps). Reconsider once audit appetite is clearer.
- **Profile-side shogo edit.** Shogo on the user profile is a denormalised
  read; it is only written by the recompute path.
- **CASL instance-level rules on `RankHistory`.** Authorisation is enforced
  primarily in the service layer because the rules need to join across
  `instructor_students`, `grading_officers`, and `organisations.headInstructorId`.
  CASL gates the class-level surface (`('read', 'RankHistory')`,
  `('manage', 'BeltRank')`); per-row checks stay in the service.

## 3. Deviations from the original prompt

The original prompt is the basis for this design. Five places the spec
diverges from the prompt's literal wording, with rationale:

1. **All catalog IDs are `uuid` (Postgres native, `defaultRandom`).** The
   prompt has `belt_ranks.id int PK (autoincrement)` but uuids elsewhere. The
   codebase universally uses `uuid('id').defaultRandom().primaryKey()` for
   new catalog tables (see `organisations`, `organisationMembership`); mixing
   in autoincrement integers here would be the only int FK in the schema.
2. **`belt_ranks.min_age_id` → `min_age` (int).** The prompt's description
   says "minimum age required NULL value or 0 means no age requirement exist",
   which is a value, not a foreign key — reading the `_id` suffix as a typo.
3. **Auth uses CASL `(action, subject)` tuples, not namespaced strings.** The
   prompt's `ranks:manage` and `progress:students` are rewritten as
   `('manage', 'BeltRank')` and `('read', 'RankHistory')` plus service-layer
   predicates. Four new subjects (`BeltSystem`, `BeltRank`, `RankHistory`,
   `ShogoTitle`) join the existing CASL vocabulary.
4. **Postgres-native column types.** `boolean`, `date`, `timestamptz`, `uuid`
   in place of the prompt's `text` placeholders (the prompt explicitly allowed
   adjustment).
5. **i18n column nullability follows the existing pattern.** `name_en/sv/fi`
   are required; `name_ja` and `name_romaji` are nullable on tables where the
   field is not a primary display name. Description fields are nullable
   throughout.

Any of these can be reverted in design review.

---

## 4. Data model

All four tables live under
`apps/backend/src/infrastructure/database/schema/`; each is its own file with
`Db<Name>` / `DbNew<Name>` `$inferSelect`/`$inferInsert` type exports.
Snake-case columns in SQL, camelCase TS fields, mapped by Drizzle.

### 4.1 `belt_systems`

A family of ranks (Kyu, Dan, Mon, …). `organisation_id` NULL → global system
available to every organisation; non-null → org-private.

```
id               uuid          PRIMARY KEY DEFAULT gen_random_uuid()
code             text          NOT NULL          -- short code 'kyu' | 'dan' | 'mon'
name_en          text          NOT NULL
name_sv          text          NOT NULL
name_fi          text          NOT NULL
organisation_id  uuid          NULL  REFERENCES organisations(id) ON DELETE CASCADE
sort_order       int           NOT NULL DEFAULT 0
created_at       timestamptz   NOT NULL DEFAULT now()
updated_at       timestamptz   NOT NULL DEFAULT now()

UNIQUE (organisation_id, code)  -- a system code is unique per scope; multiple orgs may share 'kyu'
INDEX (organisation_id)
```

### 4.2 `belt_ranks`

A specific rank inside a system (5th Kyu, 3rd Dan, …).

```
id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid()
organisation_id     uuid          NULL  REFERENCES organisations(id) ON DELETE CASCADE
system_id           uuid          NOT NULL REFERENCES belt_systems(id) ON DELETE RESTRICT
level               int           NOT NULL          -- ascending within system (1 = lowest)
sort_order          int           NOT NULL DEFAULT 0  -- global display order across systems
name_ja             text          NULL
name_romaji         text          NOT NULL          -- canonical short name
name_en             text          NOT NULL DEFAULT ''
name_sv             text          NOT NULL DEFAULT ''
name_fi             text          NOT NULL DEFAULT ''
belt_color          text          NOT NULL          -- hex like '#FFD700'
image_url           text          NULL
description_en      text          NULL
description_sv      text          NULL
description_fi      text          NULL
publicly_visible    boolean       NOT NULL DEFAULT false
slug                text          NULL              -- url slug; REQUIRED when publicly_visible=true
min_age             int           NULL              -- NULL or 0 ⇒ no requirement
next_rank_id        uuid          NULL  REFERENCES belt_ranks(id) ON DELETE SET NULL
created_at          timestamptz   NOT NULL DEFAULT now()
updated_at          timestamptz   NOT NULL DEFAULT now()

UNIQUE (organisation_id, system_id, level)
UNIQUE (slug) WHERE slug IS NOT NULL
INDEX (system_id)
INDEX (organisation_id)
CHECK (NOT publicly_visible OR slug IS NOT NULL AND slug <> '')
```

Notes:

- `level` ascends within a system (1 = lowest); `sort_order` is the global
  display order across systems (lets a UI sort Kyu before Dan before Mon).
- `next_rank_id` is an explicit override; consumers traversing the ladder
  prefer it over a `sort_order` walk. Self-references are allowed but
  meaningless (the service rejects rank == next_rank).
- The unique partial index on `slug` enforces global uniqueness when set; the
  CHECK constraint enforces "slug required if publicly_visible".

### 4.3 `shogo_titles`

Honorary titles overlaid on Dan ranks (Renshi, Kyoshi, Hanshi). Few rows,
seeded once. `code` is the stable identifier used in `rank_history.shogoTitle`
and on the user profile.

```
code         text          PRIMARY KEY              -- 'renshi' | 'kyoshi' | 'hanshi'
name_en      text          NOT NULL
name_sv      text          NOT NULL
name_fi      text          NOT NULL
name_ja      text          NOT NULL
min_rank_id  uuid          NOT NULL REFERENCES belt_ranks(id) ON DELETE RESTRICT
sort_order   int           NOT NULL DEFAULT 0       -- 'highest verified' ordering
```

`sort_order` is the canonical ranking when picking the *highest* shogo at
recompute time (renshi < kyoshi < hanshi).

### 4.4 `rank_history`

The unified log of every grading.

```
id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid()
user_id                text          NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
rank_id                uuid          NOT NULL REFERENCES belt_ranks(id) ON DELETE RESTRICT
shogo_title            text          NULL  REFERENCES shogo_titles(code) ON DELETE RESTRICT
date                   date          NOT NULL
result                 rank_history_result   NOT NULL   -- pgEnum: 'pass' | 'fail'
source                 rank_history_source   NOT NULL   -- pgEnum: 'event' | 'external'
event_id               uuid          NULL              -- FK declared in followup once grading_events exists
recorded_by_user_id    text          NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT
examiner_name          text          NULL
organisation_name      text          NULL
notes                  text          NULL
verified               boolean       NOT NULL DEFAULT false
verified_by_user_id    text          NULL  REFERENCES "user"(id) ON DELETE SET NULL
verified_at            timestamptz   NULL
created_at             timestamptz   NOT NULL DEFAULT now()
updated_at             timestamptz   NULL
updated_by_user_id     text          NULL  REFERENCES "user"(id) ON DELETE SET NULL

UNIQUE INDEX uq_rank_history_event_user  ON (event_id, user_id) WHERE event_id IS NOT NULL
INDEX (user_id, date DESC)
INDEX (rank_id)
INDEX (verified)  -- supports "highest verified shogo" recompute
CHECK (
  (source = 'event'    AND event_id IS NOT NULL) OR
  (source = 'external' AND event_id IS NULL)
)
CHECK (
  (verified = false AND verified_by_user_id IS NULL AND verified_at IS NULL) OR
  (verified = true  AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL)
)
```

`event_id`'s FK to `grading_events` is declared in a later migration (see the
followup-dependencies doc) — at v1 the column exists, the partial unique
index guards against double-mirroring, but the FK constraint is added when
the `grading_events` table lands.

Two pgEnums:

```ts
export const rankHistoryResult = pgEnum('rank_history_result', ['pass', 'fail']);
export const rankHistorySource = pgEnum('rank_history_source', ['event', 'external']);
```

---

## 5. Invariants & business rules

The service layer enforces every rule below; the DB enforces what it can via
CHECK constraints (the two listed above).

1. **Event-sourced rows are immutable from this API.** They are created and
   deleted by the grading-event workflow only. They are implicitly verified
   (`verified=true`, `verified_by_user_id = recorded_by_user_id`,
   `verified_at = created_at`) at insert. The `/rank-history` endpoints
   reject any PATCH / DELETE / verify / unverify with `SOURCE_EVENT` 400 for
   `source='event'` rows.
2. **External rows** are created by users about themselves or by instructors
   /admins about students. They start `verified=false`.
3. **Editing a verified external row** that changes any of `rank_id`, `date`,
   or `shogo_title` MUST atomically clear `verified`, `verified_by_user_id`,
   `verified_at` in the same transaction as the update. Editing only `notes`,
   `examiner_name`, or `organisation_name` preserves verification. (`result`
   is not editable through the external-entry API — external entries are
   always passes; if a user wants to record a failure they delete and recreate
   it.)
4. **Recorder ≠ verifier.** An actor whose `id === row.recorded_by_user_id`
   cannot verify or unverify the row. Returns 403 `FORBIDDEN`.
5. **Verifying or unverifying a row that carries a shogo title** triggers a
   shogo recompute for the subject user: select the highest verified shogo
   from their `rank_history` (ordered by `shogo_titles.sort_order DESC`,
   breaking ties by `rank_history.date DESC`) and write it to
   `user_profile.shogo_title`; clear if no verified shogo exists. The
   recompute runs in the same transaction as the verify/unverify.
6. **Rank delete guards.** `DELETE /api/ranks/:id` returns 409 `RANK_IN_USE`
   if the rank is referenced from:
   - any `user_profile.current_rank_id`,
   - any `rank_history.rank_id`,
   - any `grading_events` enrollment (referenced via the followup-tracker
     table; if `grading_events` doesn't exist yet, this guard is a no-op),
   - any `shogo_titles.min_rank_id`,
   - any `belt_ranks.next_rank_id` (no orphan pointers).
7. **System delete guards.** Deleting a `belt_systems` row is refused 409 if
   any `belt_ranks` rows reference it.
8. **Shogo delete guards.** Deleting a `shogo_titles` row is refused 409 if
   any `rank_history.shogoTitle` references it, or any user profile carries
   it.
9. **Slug uniqueness + required-when-public** is enforced both at the DB
   (partial unique index + CHECK) and at the contract layer (Zod
   `.refine`).

---

## 6. Authorisation

### 6.1 New CASL subjects

Extend `SubjectSchema` (in `packages/contracts/src/casl.ts`) with four new
subjects and corresponding `*SubjectShape` types:

```ts
'BeltSystem' | 'BeltRank' | 'RankHistory' | 'ShogoTitle'
```

These carry no per-instance fields beyond `id` (rule conditions like "the
verifier's organisation matches" don't translate cleanly into CASL conditions
because they cross joins; they live in the service layer instead).

### 6.2 Class-level rules

Contributed by a new `BeltCatalogAbilityRules` and `RankHistoryAbilityRules`
class implementing `AbilityRuleContributor`:

| Role | Rules |
|---|---|
| Sysadmin | `('manage', 'all')` (existing wildcard already covers this) |
| Authenticated user | `('read', 'BeltSystem')`, `('read', 'BeltRank')`, `('read', 'ShogoTitle')` (the catalog is broadly readable) |
| Authenticated user | `('read', 'RankHistory')` — but the controller still narrows by subject (see §6.3) |
| Authenticated user | `('create', 'RankHistory')` and `('update', 'RankHistory')` and `('delete', 'RankHistory')` — class-level only; the service enforces per-row authorship |

### 6.3 Service-layer authorisation predicates

The cross-join rules live in dedicated predicate methods on a new
`RankHistoryAuthService`:

#### `canRead(actor, subjectUserId): boolean`

True if **any** of:
- `actor.id === subjectUserId`
- actor is sysadmin
- actor has `('read', 'RankHistory')` AND actor shares an organisation with
  the subject (via `organisation_membership`). The "progress:students" intent
  in the original prompt maps onto this org-shared check.

#### `canEdit(actor, row): boolean`

True if **any** of:
- `row.source === 'external'` AND `actor.id === row.recordedByUserId`
- `row.source === 'external'` AND `actor.id === row.userId`
- actor is sysadmin
Event rows are never editable.

#### `canDelete(actor, row): boolean` — same logic as `canEdit`.

#### `canVerify(actor, row): boolean`

False if `row.source === 'event'` (event rows are immutable through this API).
False if `actor.id === row.recordedByUserId` (recorder ≠ verifier).
Otherwise true if **any** of:
1. Actor is sysadmin.
2. Actor is the head instructor of the subject's organisation
   (`organisations.head_instructor_id = actor.id`, where the subject's
   organisation comes from the subject user's organisation membership).
3. Actor has a row in `instructor_students` linking actor → subject (see
   followup).
4. Actor is a grading officer (`grading_officers` row), AND has a row in
   `grading_officer_systems` with `system_id = rank.system_id` AND
   `max_rank_level >= rank.level` (the cap covers the rank; using `level`
   instead of `rank_id` so the cap is stable across rank renames — see
   followup).

The auth service does ONE batched lookup per request: it loads the actor's
sysadmin flag, head-instructor orgs, `instructor_students` matches, and
`grading_officer_systems` rows once, and reuses them across every row of the
unified projection (§7.4). This keeps the projection O(rows) rather than
O(rows × roles).

---

## 7. Backend

Three new NestJS modules, each mirroring the established
controller/service/repository/dto/spec shape from `memberships/`:

```
apps/backend/src/modules/belt-catalog/
  belt-systems.controller.ts
  belt-systems.service.ts
  belt-systems.repository.ts
  belt-ranks.controller.ts
  belt-ranks.service.ts
  belt-ranks.repository.ts
  shogo-titles.controller.ts
  shogo-titles.service.ts
  shogo-titles.repository.ts
  belt-catalog.module.ts
  belt-catalog.abilities.ts
  dto/

apps/backend/src/modules/rank-history/
  rank-history.controller.ts
  rank-history.service.ts
  rank-history.repository.ts
  rank-history.auth.service.ts            -- the predicate batcher
  rank-history.module.ts
  rank-history.abilities.ts
  dto/

apps/backend/src/modules/grading-history-projection/
  grading-history.controller.ts            -- only exposes GET history/:userId
  grading-history.service.ts               -- denormalised join + canVerify/canEdit
  grading-history.module.ts
  dto/
```

`BeltCatalogModule` exports `BeltSystemsRepository`, `BeltRanksRepository`,
`ShogoTitlesRepository`, and the three services. `RankHistoryModule` imports
`BeltCatalogModule` (for rank/shogo lookups during recompute) and `UsersModule`
(for `UsersRepository` user-existence checks). `GradingHistoryProjectionModule`
imports both.

### 7.1 Endpoints

| Method & Path | Handler | Class-level CASL | Per-row authz |
|---|---|---|---|
| `GET    /api/belt-systems` | `BeltSystemsController.list` | `('read', 'BeltSystem')` | — |
| `POST   /api/belt-systems` | `BeltSystemsController.create` | `('manage', 'BeltSystem')` | — |
| `PATCH  /api/belt-systems/:id` | `BeltSystemsController.update` | `('manage', 'BeltSystem')` | — |
| `DELETE /api/belt-systems/:id` | `BeltSystemsController.remove` | `('manage', 'BeltSystem')` | guard 409 |
| `GET    /api/ranks` | `BeltRanksController.list` | `('read', 'BeltRank')` | — |
| `GET    /api/ranks/:id` | `BeltRanksController.findOne` | `('read', 'BeltRank')` | 404 |
| `POST   /api/ranks` | `BeltRanksController.create` | `('manage', 'BeltRank')` | slug rule |
| `PATCH  /api/ranks/:id` | `BeltRanksController.update` | `('manage', 'BeltRank')` | slug rule |
| `DELETE /api/ranks/:id` | `BeltRanksController.remove` | `('manage', 'BeltRank')` | guards 409 |
| `GET    /api/shogo-titles` | `ShogoTitlesController.list` | `('read', 'ShogoTitle')` | — |
| `POST   /api/shogo-titles` | `ShogoTitlesController.create` | `('manage', 'ShogoTitle')` | — |
| `PATCH  /api/shogo-titles/:code` | `ShogoTitlesController.update` | `('manage', 'ShogoTitle')` | — |
| `DELETE /api/shogo-titles/:code` | `ShogoTitlesController.remove` | `('manage', 'ShogoTitle')` | guards 409 |
| `GET    /api/rank-history/:userId` | `RankHistoryController.listForUser` | `('read', 'RankHistory')` | `canRead(actor, userId)` |
| `POST   /api/rank-history/:userId` | `RankHistoryController.create` | `('create', 'RankHistory')` | actor permitted to record for subject |
| `PATCH  /api/rank-history/:id` | `RankHistoryController.update` | `('update', 'RankHistory')` | `canEdit`, reject `source='event'` |
| `DELETE /api/rank-history/:id` | `RankHistoryController.remove` | `('delete', 'RankHistory')` | `canDelete`, reject `source='event'` |
| `POST   /api/rank-history/:id/verify` | `RankHistoryController.verify` | `('update', 'RankHistory')` | `canVerify`, reject self-verify, reject event |
| `POST   /api/rank-history/:id/unverify` | `RankHistoryController.unverify` | `('update', 'RankHistory')` | `canVerify`, reject self-verify, reject event |
| `GET    /api/grading-events/history/:userId` | `GradingHistoryProjectionController.list` | `('read', 'RankHistory')` | `canRead(actor, userId)` |

**`POST /api/rank-history/:userId` actor rules**: the actor may create an
external entry about themselves OR about a student they're authorised to
verify for (i.e. `canVerify` for the same actor + same subject would return
true, *minus* the recorder ≠ verifier rule). Sysadmins always permitted.

### 7.2 Verify / unverify flow (service)

```ts
async verify(rowId, actor) {
  return this.db.transaction(async tx => {
    const row = await this.repo.findById(rowId, tx);
    if (!row) throw new NotFoundException('NOT_FOUND');
    if (row.source === 'event') throw new BadRequestException('SOURCE_EVENT');
    if (row.verified) throw new ConflictException('ALREADY_VERIFIED');
    if (row.recordedByUserId === actor.id) throw new ForbiddenException('FORBIDDEN');

    const allowed = await this.auth.canVerify(actor, row, tx);
    if (!allowed) throw new ForbiddenException('FORBIDDEN');

    await this.repo.markVerified(rowId, {
      verifiedByUserId: actor.id,
      verifiedAt: new Date(),
    }, tx);

    if (row.shogoTitle) {
      await this.recomputeShogo(row.userId, tx);
    }
    return this.repo.findById(rowId, tx); // returns hydrated row
  });
}
```

`recomputeShogo(userId, tx)`:

```ts
const top = await tx
  .select({ code: rankHistory.shogoTitle, sortOrder: shogoTitles.sortOrder })
  .from(rankHistory)
  .innerJoin(shogoTitles, eq(shogoTitles.code, rankHistory.shogoTitle))
  .where(and(
    eq(rankHistory.userId, userId),
    eq(rankHistory.verified, true),
    isNotNull(rankHistory.shogoTitle),
  ))
  .orderBy(desc(shogoTitles.sortOrder), desc(rankHistory.date))
  .limit(1);

await tx.update(userProfile).set({ shogoTitle: top[0]?.code ?? null }).where(...);
```

(`user_profile.shogo_title` is a followup column — see the dependencies doc.)

### 7.3 Edit flow (service)

```ts
async update(rowId, input, actor) {
  return this.db.transaction(async tx => {
    const row = await this.repo.findById(rowId, tx);
    if (!row) throw new NotFoundException('NOT_FOUND');
    if (row.source === 'event') throw new BadRequestException('SOURCE_EVENT');
    if (!this.auth.canEdit(actor, row)) throw new ForbiddenException('FORBIDDEN');

    const changesVerificationContent =
      ('rankId' in input && input.rankId !== row.rankId) ||
      ('date' in input && input.date !== row.date) ||
      ('shogoTitle' in input && input.shogoTitle !== row.shogoTitle);

    const patch = buildPatch(input);
    if (row.verified && changesVerificationContent) {
      patch.verified = false;
      patch.verifiedByUserId = null;
      patch.verifiedAt = null;
    }
    patch.updatedAt = new Date();
    patch.updatedByUserId = actor.id;

    const updated = await this.repo.update(rowId, patch, tx);

    // shogo recompute only when the row's shogo OR verified flag actually moved
    if (row.verified && changesVerificationContent && row.shogoTitle) {
      await this.recomputeShogo(row.userId, tx);
    } else if (
      'shogoTitle' in input && input.shogoTitle !== row.shogoTitle && row.verified
    ) {
      await this.recomputeShogo(row.userId, tx);
    }

    return updated;
  });
}
```

### 7.4 Unified projection (`GradingHistoryProjectionService.list`)

```ts
async list(subjectUserId, actor) {
  // 1. Read rows + joined hydration in a single query
  const rows = await this.repo.listJoined(subjectUserId);
  //    rows[].event           : { id, organisationId, officerUserId, organisationNameEn } | null
  //    rows[].verifiedBy      : { id, name } | null
  //    rows[].rank.system_id  : uuid
  //    rows[].rank.level      : int

  // 2. Batch the actor's role lookups ONCE
  const roleCtx = await this.authBatcher.load(actor, subjectUserId);
  //    { isSysadmin, isHeadInstructorOf: Set<orgId>, linkedToStudents: Set<userId>,
  //      gradingOfficerCaps: Map<systemId, maxLevel> }

  // 3. Hydrate examiner, organisationName, canVerify, canEdit per row
  return rows.map(row => ({
    id: row.id,
    source: row.source,
    userId: row.userId,
    rankId: row.rankId,
    shogoTitle: row.shogoTitle,
    date: row.date,
    result: row.result,
    notes: row.notes,
    examiner: row.source === 'event'
      ? row.event?.officerName ?? null
      : row.examinerName,
    organisationName: row.source === 'event'
      ? row.event?.organisationNameEn ?? null
      : row.organisationName,
    verified: row.verified,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    canVerify: this.auth.canVerifyWithCtx(actor, row, roleCtx),
    canEdit: this.auth.canEditWithCtx(actor, row, roleCtx),
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  }));
}
```

The batcher returns plain JS data structures; `canVerifyWithCtx` and
`canEditWithCtx` are synchronous after the batcher fired.

---

## 8. Contracts (`@repo/contracts`)

Three new modules, each a new subpath export (`./belt-systems`, `./ranks`,
`./rank-history`). A fourth touch updates `casl.ts` (new subjects) and
`routes.ts` (route constants).

### 8.1 `packages/contracts/src/belt-systems.ts`

```ts
CreateBeltSystemSchema = z.object({
  code: z.string().min(1).max(3),
  nameEn: z.string().min(1).max(100),
  nameSv: z.string().min(1).max(100),
  nameFi: z.string().min(1).max(100),
  organisationId: z.string().uuid().nullable().optional(),
  sortOrder: z.int().min(0).default(0),
}).meta({ id: 'CreateBeltSystemInput', ... });

UpdateBeltSystemSchema = CreateBeltSystemSchema.partial();
BeltSystemSchema       = ... // full read shape including id + timestamps
```

### 8.2 `packages/contracts/src/ranks.ts`

```ts
SlugRegex = /^[a-z0-9-]+$/;

CreateBeltRankSchema = z.object({
  organisationId: z.string().uuid().nullable().optional(),
  systemId: z.string().uuid(),
  level: z.int().positive(),
  sortOrder: z.int().min(0).default(0),
  nameJa: z.string().nullable().default(null),
  nameRomaji: z.string().min(1),
  nameEn: z.string().default(''),
  nameFi: z.string().default(''),
  nameSv: z.string().default(''),
  beltColor: z.string().min(1),       // hex enforced by .regex(/^#[0-9a-fA-F]{6}$/) — TBD in review
  imageUrl: z.string().url().nullable().optional(),
  descriptionEn: z.string().nullable().default(null),
  descriptionFi: z.string().nullable().default(null),
  descriptionSv: z.string().nullable().default(null),
  publiclyVisible: z.boolean().default(false),
  slug: z.string().regex(SlugRegex).nullable().optional(),
  minAge: z.int().min(0).nullable().optional(),
  nextRankId: z.string().uuid().nullable().optional(),
}).refine(
  v => !v.publiclyVisible || (typeof v.slug === 'string' && v.slug.length > 0),
  { path: ['slug'], message: 'Slug required when publicly visible.' },
);

UpdateBeltRankSchema = CreateBeltRankSchema.partial().refine(/* same slug rule when both fields present */);
BeltRankSchema       = ... // full read shape
```

### 8.3 `packages/contracts/src/rank-history.ts`

```ts
DateStringSchema  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
RankHistoryResult = z.enum(['pass', 'fail']);
RankHistorySource = z.enum(['event', 'external']);

CreateRankHistorySchema = z.object({
  rankId: z.string().uuid(),
  shogoTitle: z.string().min(1).max(50).nullable().optional(),
  date: DateStringSchema,
  examinerName: z.string().max(200).nullable().optional(),
  organisationName: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});
UpdateRankHistorySchema = CreateRankHistorySchema.partial();

// Unified projection row (the GET /api/grading-events/history/:userId payload)
GradingHistoryRowSchema = z.object({
  id: z.string().uuid(),
  source: RankHistorySource,
  userId: z.string(),
  rankId: z.string().uuid(),
  shogoTitle: z.string().nullable(),
  date: DateStringSchema,
  result: RankHistoryResult,
  notes: z.string().nullable(),
  examiner: z.string().nullable(),
  organisationName: z.string().nullable(),
  verified: z.boolean(),
  verifiedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  verifiedAt: z.string().datetime().nullable(),
  canVerify: z.boolean(),
  canEdit: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
  updatedByUserId: z.string().nullable(),
});

GradingHistoryResponseSchema = z.object({ data: GradingHistoryRowSchema.array() });
```

### 8.4 `packages/contracts/src/routes.ts`

```ts
export const BeltSystemsRoutes = {
  base: '/api/belt-systems',
  byId: (id: string) => `/api/belt-systems/${id}` as const,
} as const;

export const BeltRanksRoutes = {
  base: '/api/ranks',
  byId: (id: string) => `/api/ranks/${id}` as const,
} as const;

export const ShogoTitlesRoutes = {
  base: '/api/shogo-titles',
  byCode: (code: string) => `/api/shogo-titles/${code}` as const,
} as const;

export const RankHistoryRoutes = {
  byUser:        (userId: string) => `/api/rank-history/${userId}` as const,
  byId:          (id: string)     => `/api/rank-history/${id}` as const,
  verify:        (id: string)     => `/api/rank-history/${id}/verify` as const,
  unverify:      (id: string)     => `/api/rank-history/${id}/unverify` as const,
  unifiedForUser:(userId: string) => `/api/grading-events/history/${userId}` as const,
} as const;
```

Three new `*OpenApiRegistry` consts are added and registered in
`registerContractSchemas`. `casl.ts` `SubjectSchema` gains the four new
subject names.

### 8.5 Error codes

The HTTP error envelope (`ErrorEnvelopeDto`) returns
`{ error: { code, message } }`. New codes used by this surface:

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod parse failure (existing) |
| `FORBIDDEN` | 403 | CASL or service predicate denied (existing) |
| `NOT_FOUND` | 404 | Row not found (existing) |
| `SOURCE_EVENT` | 400 | Operation rejected because row is event-sourced |
| `ALREADY_VERIFIED` | 409 | `POST /verify` on a verified row |
| `ALREADY_UNVERIFIED` | 409 | `POST /unverify` on an unverified row |
| `SHOGO_NOT_FOUND` | 404 | Patch referenced a non-existent shogo code |
| `RANK_IN_USE` | 409 | Rank delete blocked by guard |
| `SYSTEM_IN_USE` | 409 | System delete blocked by ranks |
| `SHOGO_IN_USE` | 409 | Shogo delete blocked by history/profile |

---

## 9. Frontend

FSD layout matching the rest of `apps/frontend/src/`.

### 9.1 New entities

```
apps/frontend/src/entities/belt-rank/        -- catalog read API + query options
  api/  model/  lib/  index.ts
apps/frontend/src/entities/shogo-title/      -- catalog read API + query options
apps/frontend/src/entities/rank-history/     -- list + mutations
```

Query factories: `getRanks()`, `getBeltSystems()`, `getShogoTitles()`,
`getGradingHistory(userId)`, plus the four mutation hooks
(`useCreateRankHistory`, `useUpdateRankHistory`, `useDeleteRankHistory`,
`useVerifyRankHistory`, `useUnverifyRankHistory`). Mutations follow the
spread-then-compose `onSuccess` pattern; they invalidate
`rankHistoryKeys.unified(userId)` and the user profile (when the recompute
might have changed the shogo).

### 9.2 Lib helpers (`entities/belt-rank/lib/`)

- `rankLabel(rank, lang)` → `"{romaji} — {localisedName}"`; falls back to
  romaji only when no localised name exists. Mirrors `countryName` /
  `displayName` conventions.
- `getBeltVisuals(systemCode, level, shogoTitle?)` → returns the visual
  descriptor `{ gradient, midLine?, midLineGradient?, stripe?, badge?,
  overlayTopHalf? }` used by `BeltGraphic`. The rule table (Kyu colours by
  level, Dan = black with optional stripes by level, Mon = white with
  coloured stripes, Renshi/Kyoshi/Hanshi overlays) is documented in the
  module's docblock.

### 9.3 Shared UI: `BeltGraphic`

```
apps/frontend/src/shared/ui/belt-graphic/BeltGraphic.tsx
```

A pure presentational component (no data fetching) that takes a `BeltVisuals`
descriptor and renders the belt SVG/CSS gradient.

### 9.4 Pages

- `apps/frontend/src/pages/grading-history/` — the `HistoryPage`. Two-column
  grid: left = `<GradingTimeline />`; right = sidebar (`TimeInGradeCard`,
  `NextRankCard`, `ClubCard`, `TrainingStatsGrid` — all in the followup
  tracker). Header has an **Add past grading** button gated by the
  `grading-history` flag, opening `<RankHistoryFormDialog />`.
- Route file `apps/frontend/src/app/router/routes/_app.grading-history.tsx`
  under the authenticated `_app` layout. Default path `/grading-history`; for
  the admin view of another user, `/admin/users/:id/grading-history` is added
  as a sibling route under the admin tree.

### 9.5 Features

- `features/grading-timeline/` — the read-only timeline. `<GradingTimeline>`
  maps over the unified projection rows; `<GradingTimelineEntry>` renders one
  row.
- `features/rank-history-form/` — the modal form for create/edit external
  entries. Used by both the self-service page and (admin variant) by the
  admin grading-history view. Shows the amber "Saving will clear verification"
  warning when editing a verified row whose verification-content fields are
  dirty (compares against the row's seed values).

### 9.6 `<GradingTimelineEntry>` rendering rules

| Element | Rule |
|---|---|
| Rail/border colour | `rank.beltColor`; full colour on the latest pass row, 40% alpha on older passes, error colour on fails |
| Status icon | latest pass = check, older pass = award, fail = X |
| Title | `${localisedName} — ${romaji} ${nameJa ?? ''}` via `rankLabel` |
| `FAILED` badge | `result === 'fail'` |
| `EXTERNAL` badge | `source === 'external'` |
| `Pending verification` badge | `source === 'external' && !verified` AND feature flag `grading-history-verification` enabled |
| `Verified` shield | `verified` AND feature flag enabled; tooltip "verified by {name} on {date}" |
| Shogo chip | `shogoTitle != null`; localised name |
| Action row | gated by flags AND `canEdit`/`canVerify`; Edit (`external && canEdit`), Verify/Unverify (`canVerify`) |
| BeltGraphic | rendered beneath the title via `getBeltVisuals` (Dan + shogo paints a top-half overlay: renshi=magenta, kyoshi=green, hanshi=brown) |
| Examiner line | `"${examiner} · ${organisationName}"` (omits empty parts), italic |
| Notes block | left border colour = `rank.beltColor` |

### 9.7 Feature flags

Two new flags, both consumed via the followup-tracker flag service:

- `grading-history` — show the **Add past grading** button + the form modal.
- `grading-history-verification` — show the `Pending verification` /
  `Verified` badges, the Verify/Unverify actions, and the amber warning on
  verified-edit.

Until the flag service exists, both flags resolve to `false`. The page itself
loads and renders read-only timelines regardless.

### 9.8 i18n keys

New `gradingHistory.*` subtree in `en.json`, `sv.json`, `fi.json` covering:

- Page title, descriptions.
- Belt-catalog admin labels.
- Timeline entry labels (`failed`, `external`, `pendingVerification`,
  `verifiedBy`, `editEntry`, `verifyEntry`, `unverifyEntry`,
  `clearsVerificationWarning`, `addPastGrading`, etc.).
- Form field labels for the rank-history modal.
- Shogo title display names (Renshi / Kyoshi / Hanshi) — these mirror the
  DB-side `shogo_titles.name_*` columns; the i18n keys are the fallback when
  the catalog hasn't loaded yet.

---

## 10. Seeding

A new seeder stub at `apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.ts`
that reads from a JSON payload colocated at
`apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.json`:

```jsonc
{
  "beltSystems": [
    { "code": "kyu", "nameEn": "Kyu", "nameSv": "Kyu", "nameFi": "Kyu", "sortOrder": 1 },
    { "code": "dan", "nameEn": "Dan", "nameSv": "Dan", "nameFi": "Dan", "sortOrder": 2 },
    { "code": "mon", "nameEn": "Mon", "nameSv": "Mon", "nameFi": "Mon", "sortOrder": 3 }
  ],
  "beltRanks": [
    {
      "systemCode": "kyu", "level": 1, "sortOrder": 10,
      "nameRomaji": "Jukyu", "nameEn": "10th Kyu", "nameSv": "10 Kyu", "nameFi": "10. Kyu",
      "beltColor": "#FFFFFF", "publiclyVisible": false
    }
    // … remaining kyu / dan / mon rows
  ],
  "shogoTitles": [
    { "code": "renshi", "nameEn": "Renshi", "nameSv": "Renshi", "nameFi": "Renshi", "nameJa": "錬士", "minRankRomaji": "Yondan", "sortOrder": 1 },
    { "code": "kyoshi", "nameEn": "Kyoshi", "nameSv": "Kyoshi", "nameFi": "Kyoshi", "nameJa": "教士", "minRankRomaji": "Rokudan", "sortOrder": 2 },
    { "code": "hanshi", "nameEn": "Hanshi", "nameSv": "Hanshi", "nameFi": "Hanshi", "nameJa": "範士", "minRankRomaji": "Nanadan", "sortOrder": 3 }
  ]
}
```

The seeder is **idempotent**: it looks up each row by its natural key
(`(organisation_id, code)` for systems, `(organisation_id, system_id, level)`
for ranks, `code` for shogo titles), inserts if absent, updates fields if
present. Rows it didn't author are left untouched. The shogo seeder resolves
`minRankRomaji` to a `rank_id` by querying `belt_ranks` (so ranks must seed
first). The seeder is invoked by `pnpm --filter backend db:seed` and is safe
to re-run.

The JSON ships with a representative starter set (10 kyu, 10 dan, mon
optional) sourced from the real organisation's published rank table; the
actual rank list is a TODO for the implementation plan.

---

## 11. Testing strategy

### 11.1 Contract Zod tests

- Each `Create*Schema` accepts valid shapes; each rejects clearly invalid
  ones (bad date, over-long string, slug missing when public, slug regex
  violation, hex colour shape).

### 11.2 Backend unit tests (`*.service.spec.ts`)

- **`BeltRanksService`**: create rejects slug-missing-when-public, delete
  refuses with `RANK_IN_USE` when referenced (each reference type covered as
  a case), `nextRankId` self-reference is rejected.
- **`ShogoTitlesService`**: delete refuses with `SHOGO_IN_USE`.
- **`RankHistoryService`**:
  - Create stamps `recordedByUserId`, `source='external'`, `result='pass'`,
    `verified=false`.
  - Edit that touches `rankId`/`date`/`shogoTitle` on a verified row clears
    the verification atomically (transaction is asserted via the same
    `fakeTx` pattern as `ProfileService.spec`).
  - Edit that touches only `notes` preserves verification.
  - Delete rejects event-sourced rows with `SOURCE_EVENT`.
  - Verify rejects event-sourced rows with `SOURCE_EVENT`.
  - Verify rejects when `actor.id === recordedByUserId` (`FORBIDDEN`).
  - Verify of a shogo row triggers `recomputeShogo`; the highest verified
    shogo is written to the user profile.
  - Unverify of a shogo row triggers the same recompute.
- **`RankHistoryAuthService`**:
  - `canVerify` true for sysadmin.
  - `canVerify` true for head instructor of subject's org.
  - `canVerify` true for instructor linked via `instructor_students`.
  - `canVerify` true for grading officer with cap covering the rank;
    `canVerify` false when the cap is one rank below.
  - `canVerify` false for the row's recorder.
  - `canRead` true for self; true for sysadmin; true for org-sharing actor
    with the ability; false otherwise.
- **`GradingHistoryProjectionService`**:
  - Hydrates examiner/organisationName from the event join when
    `source='event'`.
  - Hydrates from row columns when `source='external'`.
  - Computes `canVerify` / `canEdit` per row using the batched role context
    (only ONE auth-batcher invocation per request, asserted via spy).

### 11.3 Backend controller specs (metadata-reflection)

Mirroring the `ProfileController` spec pattern:

- `RankHistoryController.verify` and `.unverify` carry the
  `('update', 'RankHistory')` `@CheckAbility` metadata.
- `BeltRanksController.create / update / remove` carry `('manage', 'BeltRank')`.

### 11.4 Frontend component tests

- `<GradingTimeline>` renders rows in date-descending order; the latest pass
  gets full-colour styling.
- `<GradingTimelineEntry>` renders the `FAILED` badge for failures, the
  `EXTERNAL` badge for external rows, the `Pending verification` and
  `Verified` badges when the feature flag is on, and hides them when off.
- `<GradingTimelineEntry>` action row shows Edit only when `canEdit`, Verify
  only when `canVerify`.
- `<RankHistoryFormDialog>` submits a patch, shows the amber warning when
  editing a verified row whose verification-content field is dirty, and
  surfaces server errors inline.

### 11.5 Acceptance tests (from the original prompt)

These map onto backend service specs (the e2e versions wait for the test
harness):

1. Create external entry returns `verified=false`, `source='external'`,
   `recordedByUserId=actor`.
2. Non-admin user reading another user's history outside their org → 403.
3. Recorder verifying own row → 403.
4. Capped grading officer verifies within cap; rejected above it.
5. Editing a verified row's date clears `verified` and recomputes shogo.
6. Deleting an event row via `/api/rank-history/:id` → 400 `SOURCE_EVENT`.
7. Slug missing on `publiclyVisible: true` → 400 `VALIDATION_ERROR`.
8. Rank delete with any reference → 409 `RANK_IN_USE`.
9. After verifying a row with `shogoTitle='kyoshi'`, the subject's profile
   shogo title becomes the highest verified shogo across their history.

---

## 12. Dependencies on unbuilt functionality

See [`2026-05-24-belt-rank-followup-dependencies.md`](./2026-05-24-belt-rank-followup-dependencies.md)
for the enumerated list. The seven items the followup tracker carries:

1. `grading_events` table + workflow (event-sourced rows).
2. `instructor_students` table (linked-instructor verifier).
3. `grading_officers` + `grading_officer_systems` tables (capped grading
   officer verifier).
4. `user_profile.current_rank_id` + `user_profile.shogo_title` columns
   (denormalised profile state).
5. Feature-flag infrastructure (`grading-history`,
   `grading-history-verification`).
6. Right-rail sidebar cards (`TimeInGradeCard`, `NextRankCard`, `ClubCard`,
   `TrainingStatsGrid`).
7. Admin grading-history route under `/admin/users/:id/grading-history` and
   the surrounding admin user surface (overlaps with the existing
   `<UserForm>` work).

The backend gracefully degrades when these are absent: verifier predicates
that depend on missing tables resolve to `false` (catch the relation-missing
error in a feature-flag-style fallback); the projection's `examiner`/
`organisationName` for `source='event'` rows return `null` until the
`grading_events` table exists; the `shogo` recompute is a no-op when
`user_profile.shogo_title` doesn't exist yet.

---

## 13. Deliberate scope decisions (recap)

- Belt catalog (systems, ranks, shogo titles) is a single bounded module;
  ranks and shogos can be org-private but the default seeded set is global.
- Catalog IDs are UUIDs across the board (deviation #1 from §3).
- `min_age` is an integer (deviation #2).
- Authorisation uses CASL `(action, subject)` tuples; cross-join predicates
  live in the service layer (deviation #3).
- Postgres-native column types throughout (deviation #4).
- i18n nullability mirrors `organisations` (deviation #5).
- Event-sourced `rank_history` rows are immutable through this API and
  implicitly verified at insert.
- External rows start unverified; editing the verification-content fields
  (`rankId`, `date`, `shogoTitle`) clears verification atomically.
- Recorder ≠ verifier is enforced for verify and unverify alike.
- Shogo on the user profile is a denormalised read; it is only ever written
  by the recompute path.
- Self-edits of own external rows are NOT audited in v1.
- Verifier predicates that depend on followup tables fail closed (no
  unauthorised verify just because the join table is missing).
