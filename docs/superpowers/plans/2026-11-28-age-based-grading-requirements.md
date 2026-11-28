# Age-based grading requirements: implementation plan

Status: **built** (PR feat/age-based-requirements). Decisions by the owner on 2026-11-28 (see "Decisions"); see "As built" at the end for where the build differs from the design.

## Goal

Make it possible to give a kyu or dan rank different grading requirements depending on the
student's age: one set of requirements below an age, another within an age span, another above an
age. The children's system (`mon`) is not affected.

## Decisions (owner, 2026-11-28)

1. **How age is counted is a setting per national federation**, and it applies to every club in
   that country. The federation's orgadmin sets it. There are two choices:
   - `age_on_grading_date`: the student's exact age on the day of the grading;
   - `age_reached_in_grading_year`: the age the student reaches during the calendar year of the
     grading (birth-year counting, common in Swedish sport).
2. **Age groups are defined per rank** (per rank and requirement set), not once per requirement set.
3. **A variant replaces the whole requirement** for its age group. Fields are never merged.
4. **The grading history records which variant a grading was judged against.**

## What exists today (do not re-derive)

- `requirement_set`: one active set per organisation. A student's set is found by walking up the
  organisation tree from their student membership, or from the reference federation for a
  self-registered user, and falls back to the global set (`setId = null`). See
  `RankRequirementsService.resolveForUser` and the `taido-domain` skill.
- A requirement for `(rankId, setId)` is spread over five tables: `rank_grading_requirement` (the
  scalar anchor, unique on `(rank_id, set_id)`), `rank_requirement_technique`,
  `rank_requirement_pattern`, `rank_requirement_hokei_group` and
  `rank_requirement_hokei_group_pattern`. `PUT /api/requirements/:rankId` replaces all of it in one
  transaction.
- Belt systems: `kyu`, `dan`, `mon` (`belt_systems.code`). `belt_ranks.min_age` is a gate ("not
  before 18"), not different content. It stays as it is and is evaluated with the same age rule
  (decision 1).
- `rank_history` has no reference to a requirement set today.
- Organisations are `international_federation`, `national_federation` and `club`. An orgadmin has
  `manage` on their own organisation (`organisations.abilities.ts`).

## Design

### 1. Federation setting: how age is counted

- Add a column on `organisations`: `grading_age_basis text` with the values `age_on_grading_date`
  and `age_reached_in_grading_year`. It is nullable, and null means `age_on_grading_date`. The
  service rejects the column on anything other than a `national_federation`.
- **Who may change it:** the orgadmin of the federation and sysadmin, through the existing
  organisation update. CASL already grants an orgadmin `manage` on their own organisation. The
  service additionally refuses the field for non-federations. A club's orgadmin cannot change it,
  because they do not manage the federation row.
- **Which setting applies:** the nearest `national_federation` among the ancestors of the
  organisation the requirement set was resolved from (`getAncestorIds`). Without one (the global
  set, or a club directly under the international federation), the default
  `age_on_grading_date` applies.
- **UI:** organisation settings for federations (Admin → Organisations, and My organisation for a
  federation orgadmin) get "How age is counted for grading requirements", with an explanation of
  both choices.

Shared helper (backend and frontend, pure):

```ts
ageForGrading(dateOfBirth: string, gradingDate: string, basis: GradingAgeBasis): number
// age_on_grading_date:        whole years on gradingDate
// age_reached_in_grading_year: year(gradingDate) - year(dateOfBirth)
```

`belt_ranks.min_age` is checked with the same helper. Under birth-year counting, a 17-year-old who
turns 18 later in the year meets "18".

### 2. Age groups per rank

New table `rank_requirement_age_group`:

| column | type | note |
| --- | --- | --- |
| `id` | uuid pk | |
| `rank_id` | uuid fk → `belt_ranks`, cascade | |
| `set_id` | uuid fk → `requirement_set`, cascade, nullable | null-aware, like the detail tables |
| `age_from` | integer, nullable | inclusive; null = no lower bound |
| `age_to` | integer, nullable | inclusive; null = no upper bound |
| `created_at`, `updated_at` | timestamptz | |

- At least one bound is set, and `age_from <= age_to` when both are set (check constraint).
- Groups of the same `(rank, set)` must not overlap. This is checked in the service inside the
  replace transaction; an exclusion constraint is not worth it for a handful of rows.
- Gaps are allowed. An age in a gap gets the base requirement.
- Labels come from the bounds and are translated in the UI: "Under 12" (`to = 11`), "12–15",
  "16 and older" (`from = 16`). There is no free-text label to keep in three languages.
- Only allowed when the rank's system is `kyu` or `dan`. The service returns 400
  `AGE_GROUPS_NOT_ALLOWED` for `mon`.

### 3. Base requirement and variants

- Add `age_group_id uuid null` (fk → `rank_requirement_age_group`, cascade) to
  `rank_grading_requirement`, `rank_requirement_technique`, `rank_requirement_pattern` and
  `rank_requirement_hokei_group` (`..._hokei_group_pattern` follows its group).
- `age_group_id = null` is the **base requirement** and applies to every age. All existing rows
  become base requirements, so no data migration is needed.
- The unique index on the scalar becomes `(rank_id, set_id, age_group_id) NULLS NOT DISTINCT`
  (PostgreSQL 15 or later; CI and the servers run 18, and local 16 is enough). Every query uses
  the null-aware pattern for `age_group_id`, exactly like `set_id`
  (`x === null ? isNull(col) : eq(col, x)`).
- A variant is a complete requirement for one age group. "Add variant" in the editor starts from a
  copy of the base requirement (decision 3), and saving replaces the variant as a unit, like
  today's whole-scope replace.
- A variant cannot exist without a base requirement for the same `(rank, set)`. The base is what
  makes "this set has this rank" true during resolution.
- Deleting an age group deletes its variant (cascade).
- `clone` and `deepCopyDetailsForSet` copy age groups and variants, mapping the old group ids to
  the new ones.

### 4. Resolution

`resolveForUser(rankId, userId, actor, { gradingDate? })`:

1. Find the set exactly as today: walk the ancestors to the first active set that has a base
   requirement for the rank, otherwise the global set.
2. Find the age basis from the nearest national federation of the organisation the set came from
   (section 1).
3. Compute the student's age with `ageForGrading(dateOfBirth, gradingDate ?? today, basis)`.
4. Pick the age group of `(rank, set)` that contains that age. If one is found, return its
   variant; otherwise return the base requirement.
5. Without a date of birth, return the base requirement with `ageUnknown: true`, but only when
   the rank has age groups.

The `GradingRequirements` contract gets:

```ts
ageGroup: { id: string; ageFrom: number | null; ageTo: number | null } | null; // null = base
ageGroups: { id: string; ageFrom: number | null; ageTo: number | null }[];       // all of the rank's groups
ageBasis: 'age_on_grading_date' | 'age_reached_in_grading_year';
ageUnknown: boolean;
```

`GET /api/requirements/:rankId` keeps its current query and gains `ageGroupId` (null or absent
means base) for the editor and the public rank page.

### 5. The variant on the grading history (decision 4)

- Add to `rank_history`:
  - `requirement_set_id uuid null` (fk, set null)
  - `requirement_age_group_id uuid null` (fk, set null)
  - `requirement_age_from integer null`, `requirement_age_to integer null`
  - `requirement_age_basis text null`

  The three last columns are a snapshot, so the record survives later edits to or deletion of
  the group.
- **When it is written:** when a row becomes verified (`verify`, or an instructor recording a
  grading directly), the resolution from section 4 runs with `gradingDate = row.date`, and the
  result is stored. `unverify` clears it. A self-reported, unverified row has no snapshot: nobody
  has judged it against anything.
- **Known limitation:** resolution uses the set that is active at verification time. There is no
  history of which set was active on an earlier date. A grading verified long after the fact can
  therefore name today's set. This is acceptable now; when grading events (followup D1) exist,
  the event can store the set it used.
- The `RankHistory` contract shows the snapshot, and the grading timeline shows "Judged against:
  STF 2024, 12–15 years".

### 6. Interface

- **Admin → Grading requirements**, kyu and dan ranks: an "Age groups" row with "All ages" plus
  one tab per group, and buttons "Add age group" (from/to, overlap shown immediately), "Add
  variant" (copies the base) and "Remove variant / group". Mon ranks show no age controls.
- **Federation settings:** the age basis (section 1).
- **Student-facing** (progression, next-rank card, grading readiness, practice reminders):
  - only the requirement that applies, labelled "Requirements for 12–15 years";
  - when the student moves into another group before the earliest possible grading date, a note
    such as "From 1 January 2027 the requirements for 16 and older apply";
  - with `ageUnknown`, "Add your date of birth to see the requirements for your age".
- **Instructor:** the student page uses the student's age, and the same note about a missing date
  of birth.
- **Public rank page:** no signed-in student, so it shows all variants as tabs.
- **MCP tools** and grading planning call the same resolution. A tool that takes a student gets
  that student's variant.

### 7. Authorization

- Age groups and variants follow the `RequirementSet` rules unchanged: sysadmin, and orgadmin or
  instructor of the set's organisation, may manage; any authenticated user may read. They are
  written through the existing requirement endpoints, so there is no new CASL subject.
- The federation setting goes through `Organisation` `manage` (section 1).
- The service check on `PUT /api/requirements/:rankId` keeps checking the set's organisation; the
  age group must belong to the same `(rank, set)`.

## Work, in order (one PR)

1. **Contracts:** `GradingAgeBasis`, age-group schemas, the extended `GradingRequirements`, and the
   `RankHistory` snapshot fields. Add `ageForGrading` in `packages/contracts` so backend and
   frontend share one implementation.
2. **Schema and migration** (`db:generate`): the organisation column, `rank_requirement_age_group`,
   `age_group_id` on four tables with the new unique index, and the `rank_history` columns.
3. **Repository and service:** null-aware `age_group_id` throughout, overlap and kyu/dan checks,
   replace per `(rank, set, ageGroup)`, clone and deep copy, resolution with age basis, and the
   snapshot on verify and unverify.
4. **Organisation update:** `gradingAgeBasis` allowed only on national federations.
5. **Frontend:** editor tabs, federation setting, labels and notes on the student views, the
   public page tabs, and the timeline snapshot. All strings in en, sv and fi.
6. **Seeds:** the requirements seed format accepts optional `ageGroups` per rank; the current
   data stays base-only.
7. **OpenAPI** regenerated.

## Tests

- **Unit:**
  - `ageForGrading` for both bases, including birthdays on the grading day, on 31 December and on
    29 February;
  - overlap and gap rules, and the refusal for mon;
  - resolution choosing variant, base, gap and `ageUnknown`;
  - basis taken from the nearest national federation;
  - clone mapping the group ids.
- **e2e:**
  - a federation orgadmin sets the basis, and a club orgadmin cannot;
  - two students of different ages get different variants of the same rank;
  - birth-year counting moves a student into the next group on 1 January;
  - verifying stores the snapshot and unverifying clears it;
  - a mon rank refuses age groups;
  - existing base-only data behaves as before.
- **Frontend:** the editor tabs, and the student view label and notes.

## Open points (not blocking)

- Whether a club may override its federation's age basis. Not in scope: decision 1 says the
  federation decides for every club.
- A history of active sets per date, for exact retroactive resolution (see section 5).

## As built (feat/age-based-requirements)

- **Migration:** 0043. The scalar's unique index became the constraint
  `rank_grading_requirement_by_scope UNIQUE NULLS NOT DISTINCT (rank_id, set_id, age_group_id)`.
- **A group and its variant are one thing.**
  - `PUT /api/requirements/:rankId/age-groups` replaces the list of groups (`{ setId, groups }`).
  - A group listed with its `id` keeps its variant.
  - A new group gets a copy of the base requirement as its variant.
  - A group left out is deleted, and its variant goes with it (cascade).
  - The variant itself is saved with `PUT /api/requirements/:rankId` and `ageGroupId` in the body,
    and read with `GET ...?setId=&ageGroupId=`.
  - `DELETE /api/requirements/:rankId?setId=` removes the base, every group and their variants.
- **Shared helpers** in `@repo/contracts/grading-age`:
  - `ageForGrading`, `dateAgeReached`, `ageGroupContains`, `ageGroupsOverlap`;
  - the frontend's readiness helper uses them as well, for both the minimum age and the "other
    requirements apply from <date>" note.
- **Resolution:** `RankRequirementsService.locateForUser(rankId, userId, date?)` returns the set,
  its name, the age group and the age basis. `resolveForUser` uses it, and so does the snapshot
  on verify.
- **Snapshot:**
  - written on `verify`, using the grading's own date;
  - cleared on `unverify`, and when an edit clears the verification (rank, date or shogo
    changed);
  - there is no path today where a grading is recorded already verified (`create` always
    stores `verified = false`), so verification is the only place that writes it;
  - API field: `judgedAgainst` on `RankHistory` and `GradingHistoryRow`.
- **Public rank page:** the response gained `ageVariants`, one variant per group, shown as tabs.
- **Not done:** the requirements seed format still holds base requirements only. Age groups are
  entered in the admin UI. Add `ageGroups` to the seed when there is data to seed.
- **Testing note:** the e2e harness does not bind the request-scoped ability that the
  organisations HTTP routes read (they answer 500 there; there was no organisations e2e before).
  The federation setting is therefore tested through `OrganisationsService` inside
  `UserContextService.run`, and the other paths over HTTP.

