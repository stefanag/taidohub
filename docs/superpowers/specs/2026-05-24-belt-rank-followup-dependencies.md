# Belt-Rank + Rank-History — Followup Dependency Tracker

**Status:** companion to
[`2026-05-24-belt-rank-and-rank-history-design.md`](./2026-05-24-belt-rank-and-rank-history-design.md).

**Date:** 2026-05-24

**Purpose:** enumerate every piece of functionality that the belt-rank +
rank-history design references but that does not yet exist in the codebase
(or in the contracts package, or as infrastructure). For each item: a brief
sketch of the shape it would take, what part of the main design depends on
it, and the proposed build order. None of these are in scope for the first
phase of the rank-history implementation — they're tracked here so the next
batch of design work has a clear surface area.

The main design degrades gracefully against every absence (verifier
predicates fall closed, the event-sourced projection branch returns `null`,
the shogo recompute becomes a no-op until the profile column exists). The
followup items can land in any order, but the suggested sequence at the
bottom of this doc minimises rework.

---

## D1. `grading_events` table + workflow

**Depended on by:** `rank_history.event_id` FK, the projection's
`source='event'` examiner/organisation hydration, the immutability rule for
event-sourced rows, the rank-delete guard's "any grading-event enrollment"
clause.

**Sketch:**

```
grading_events
  id                uuid PK
  organisation_id   uuid NOT NULL REFERENCES organisations(id)
  scheduled_at      timestamptz NOT NULL
  status            grading_event_status NOT NULL   -- pgEnum: 'draft' | 'open' | 'closed' | 'cancelled'
  created_by_user_id text NOT NULL REFERENCES "user"(id)
  notes             text NULL
  created_at        timestamptz NOT NULL DEFAULT now()
  updated_at        timestamptz NOT NULL DEFAULT now()

grading_event_officers
  event_id           uuid NOT NULL REFERENCES grading_events(id) ON DELETE CASCADE
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  is_head_examiner   boolean NOT NULL DEFAULT false
  PRIMARY KEY (event_id, user_id)

grading_event_enrollments
  id              uuid PK
  event_id        uuid NOT NULL REFERENCES grading_events(id) ON DELETE CASCADE
  user_id         text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  rank_id         uuid NOT NULL REFERENCES belt_ranks(id) ON DELETE RESTRICT
  shogo_title     text NULL REFERENCES shogo_titles(code) ON DELETE RESTRICT
  result          rank_history_result NULL   -- NULL until the event closes
  notes           text NULL
  UNIQUE (event_id, user_id)
```

When an event transitions `status: open → closed`, the workflow:
- Iterates enrollments with a non-null `result`.
- Upserts one `rank_history` row per enrollment with
  `source='event'`, `event_id=...`, `verified=true`,
  `verified_by_user_id = recorded_by_user_id = createdByUserId`,
  `verified_at = created_at`, `examiner_name` / `organisation_name` left
  NULL (the projection joins back to the event).
- Triggers a shogo recompute for each subject if any enrollment carried a
  shogo title.

When an event is deleted (cascade), its `rank_history` rows go with it via
the existing `ON DELETE CASCADE` on `event_id`. (The FK is declared as part
of this migration, replacing the v1 partial index that only enforces
double-mirror prevention.)

**Touches the main design at:**
- `rank_history.event_id` adds its FK constraint.
- `GradingHistoryProjectionService` enables the `source='event'` hydration
  branch.
- The rank-delete guard's grading-events clause becomes active.
- A new ability subject `GradingEvent` joins the CASL vocabulary.

---

## D2. `instructor_students` table

**Depended on by:** the "linked instructor" verifier rule (`canVerify` rule
3 in §6.3 of the main design).

**Sketch:**

```
instructor_students
  id              uuid PK
  instructor_id   text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  student_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  created_at      timestamptz NOT NULL DEFAULT now()
  UNIQUE (instructor_id, student_id)
  INDEX (instructor_id)
  INDEX (student_id)
```

Probably administered by sysadmins and head instructors. A `POST
/api/instructor-students` accepts `{ instructorId, studentId }`; a `DELETE`
removes the link. The actor permitted to manage links is the head instructor
of the student's organisation, the instructor themselves (for their own
links), or sysadmin.

**Touches the main design at:**
- `RankHistoryAuthService.canVerify` enables predicate #3.
- The auth batcher loads `instructor_students` rows for the actor once per
  request.

---

## D3. `grading_officers` + `grading_officer_systems` tables

**Depended on by:** the "capped grading officer" verifier rule (`canVerify`
rule 4).

**Sketch:**

```
grading_officers
  user_id          text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE
  appointed_at     timestamptz NOT NULL DEFAULT now()
  appointed_by_user_id text NOT NULL REFERENCES "user"(id)
  notes            text NULL

grading_officer_systems
  user_id          text NOT NULL REFERENCES grading_officers(user_id) ON DELETE CASCADE
  system_id        uuid NOT NULL REFERENCES belt_systems(id) ON DELETE CASCADE
  max_rank_level   int NOT NULL          -- the cap, expressed as belt_ranks.level (stable across renames)
  PRIMARY KEY (user_id, system_id)
```

The main design references `max_rank_id` (an FK to `belt_ranks`); using
`max_rank_level` instead is the recommended refinement because the cap is
semantic ("this officer can certify up to 5th Dan") and renaming a rank row
shouldn't change the cap. The auth predicate becomes:

```ts
canVerify_GradingOfficer(actor, row):
  load officer_systems where user_id = actor.id
  find row.rank.system_id in the map
  return cap.max_rank_level >= row.rank.level
```

Administered by sysadmins. `POST /api/grading-officers` adds a user; `POST
/api/grading-officers/:userId/systems` adds a cap.

**Touches the main design at:**
- `RankHistoryAuthService.canVerify` enables predicate #4.
- The auth batcher loads `grading_officer_systems` rows for the actor once
  per request and converts them to `Map<systemId, maxLevel>`.

---

## D4. `user_profile` extensions: `current_rank_id` + `shogo_title`

**Depended on by:** the rank-delete `current_rank_id` guard, the shogo
recompute path on verify/unverify, the user-profile UI surface (when the
profile shows the user's current rank/shogo, which is out of scope here).

**Sketch:**

```sql
ALTER TABLE user_profile
  ADD COLUMN current_rank_id uuid NULL
    REFERENCES belt_ranks(id) ON DELETE SET NULL,
  ADD COLUMN shogo_title text NULL
    REFERENCES shogo_titles(code) ON DELETE SET NULL;
```

`current_rank_id` is denormalised — the source of truth is the most recent
verified `result='pass'` row in `rank_history`. A separate recompute path
(symmetric to `recomputeShogo`) writes it when a verified row lands. v1 of
this work surface can defer `current_rank_id` and only ship `shogo_title`;
the rank-delete guard then has a slimmer surface until `current_rank_id`
lands.

**Touches the main design at:**
- `ProfileService` extends to expose `currentRankId` and `shogoTitle` in
  `UserProfile`. The Profile tab on `<UserForm>` (already shipped) displays
  them when present.
- The shogo recompute path becomes operative.
- Rank-delete `current_rank_id` guard becomes operative.

---

## D5. Feature-flag infrastructure

**Depended on by:** the `grading-history` and `grading-history-verification`
flags gating the Add/Edit form, the verify/unverify actions, and the
verified/pending badges in the timeline.

The codebase has **no** feature-flag system today (no GrowthBook,
LaunchDarkly, Unleash, or local flag registry). The minimum viable approach:

**Sketch (lightweight option — bake into env + remote config later):**

```
shared/lib/feature-flags/
  flags.ts            -- typed flag registry: `export type FeatureFlag = 'grading-history' | ...`
  useFeatureFlag.ts   -- React hook returning boolean
  provider.tsx        -- reads from env (Vite-time) for now; a remote source slots in later
```

At v1, flags resolve from a single source — `VITE_FEATURE_FLAGS` parsed as a
JSON object, defaulting to `{}` (everything off). The hook reads the value
from a React context populated at app boot. Server-side, a parallel
`@Inject('FEATURE_FLAGS')` token surfaces the same map for endpoints that
need to gate behaviour (none in this design — the backend always honours the
verify/unverify endpoint; the flag only hides the UI affordance, the
endpoint stays callable).

**Touches the main design at:**
- `<HistoryPage>` reads `grading-history` to show the **Add past grading**
  button.
- `<GradingTimelineEntry>` reads `grading-history-verification` to show the
  verified/pending badges and the verify/unverify actions.
- `<RankHistoryFormDialog>` reads `grading-history-verification` to show
  the amber warning on verified-edit.

Until this lands, both flags resolve to `false` and the rank-history UI is
read-only (the page still renders the timeline, just without the affordances).

---

## D6. Right-rail sidebar cards

**Depended on by:** the `<HistoryPage>` two-column layout. The left column
is the timeline (in scope here). The right column hosts:

- `TimeInGradeCard` — duration since the latest verified pass.
- `NextRankCard` — uses `belt_ranks.next_rank_id` to render the next rank's
  card with requirements summary.
- `ClubCard` — the user's club (their `organisation_membership`).
- `TrainingStatsGrid` — counters (events attended, total grading attempts,
  etc.). Sources depend on the training-attendance feature (not yet
  designed).

Each card is its own widget slice under `apps/frontend/src/widgets/`. They
slot into a page-level grid; until they exist, the right column stays empty.

**Touches the main design at:**
- `<HistoryPage>` layout assumes a `<aside>` slot exists; until the cards
  land, it renders as an empty column with a TODO comment.

---

## D7. Admin grading-history route + admin user surface integration

**Depended on by:** the spec's mention of an admin view of another user's
history at `/admin/users/:id/grading-history`. The existing `<UserForm>`
(already shipped) has Details / Memberships / Profile tabs; this work would
add a **Grading history** tab (read-only listing + open in full page) or a
dedicated admin route.

**Sketch:** add a fourth tab to `<UserForm>` called `Grading history`. The
tab renders `<GradingTimeline subjectUserId={user.id} />` — the same feature
slice as the self-service page, just bound to a different subject and with
the sysadmin's own `canEdit` / `canVerify` flags filled in. A "Open full
page" link navigates to a sibling admin route.

**Touches the main design at:**
- The unified projection endpoint already supports any subject id; no
  backend change.
- A fourth `<TabsTrigger>` in `<UserForm>` and a corresponding
  `<TabsContent>` slot.
- A new TanStack Router route under the admin tree.

---

## D8. CASL subject + ability extensions (not really a followup — handled inline)

For traceability: the four new CASL subjects (`BeltSystem`, `BeltRank`,
`RankHistory`, `ShogoTitle`) and the rule-contributor classes are in scope
for the **main** design's first phase (they're shipped alongside the
controllers). Listed here only so the followup tracker is a complete picture
of touched surfaces.

When `GradingEvent` lands (D1), a fifth subject joins.

---

## Suggested build order

1. **Main design Phase 1: belt catalog + external rank-history MVP.** Ship
   §4.1–§4.4 schema, §7.1 endpoints minus verify/unverify, the catalog
   admin frontend, and the read-only timeline. Recorder ≠ verifier rule
   enforced; verify endpoints exist but return 403 for everyone but
   sysadmin until D2/D3 land.
2. **D5 — feature-flag system.** Tiny, unblocks UI affordances. Land before
   Phase 2 so the verify/unverify badges can roll out behind the flag.
3. **D4 — `user_profile.shogo_title` first** (skip `current_rank_id` until
   D1 lands). This makes shogo recompute live. The rank-delete
   `current_rank_id` guard becomes active later.
4. **Main design Phase 2: verification flow.** Ship verify/unverify
   endpoints with shogo recompute. Sysadmin-only for now (head-instructor
   rule via `organisations.head_instructor_id` already works).
5. **D2 — `instructor_students`.** Extends the linked-instructor verifier
   rule; live the moment the table exists.
6. **D3 — `grading_officers` + `grading_officer_systems`.** Extends the
   capped-officer verifier rule. (Refinement vs the original prompt: use
   `max_rank_level` not `max_rank_id` so caps are stable across rank
   renames.)
7. **D1 — `grading_events`.** Largest single item; ships the event
   workflow, mirrors `rank_history` rows automatically, and adds the
   `event_id` FK to `rank_history`. The projection's `source='event'`
   branch comes alive.
8. **D7 — admin grading-history tab.** Adds the fourth tab to `<UserForm>`
   and the sibling admin route. Small, can land anytime after the timeline
   feature slice exists.
9. **D6 — sidebar cards.** Independent of the rank-history backend; can be
   parallelised with any of the above.
10. **`current_rank_id` on `user_profile`** (deferred from D4). Activates
    the last rank-delete guard.

This sequencing keeps each step shippable on its own and avoids
landing-then-rebuilding any of the verifier predicates as their join tables
appear.
