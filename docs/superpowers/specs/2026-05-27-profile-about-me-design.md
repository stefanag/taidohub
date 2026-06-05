# `aboutMe` Rich-Text Field on the User Profile — Design

**Status:** approved design — not yet implemented.

**Date:** 2026-05-27

**Author:** Stefan (with Claude)

**Context:** The `<RichTextEditor>` + `<QuillViewer>` primitive landed
without form bindings ([design](./2026-05-27-rich-text-editor-design.md)).
This spec is the first concrete consumer: a free-text `aboutMe` field on the
user profile. The user authors a single-language bio in the self-service
`<ProfileForm>`; sysadmins see it read-only on the admin `<UserForm>`
Profile tab. Optional everywhere — "no about me yet" is a distinct, valid
state.

---

## 1. Goals

- Add an editable `aboutMe` field to the user-profile surface, using the
  shipped `<RichTextEditor>` for editing and `<QuillViewer>` for read-only
  display.
- End-to-end type safety: the Delta value contract flows unchanged from the
  Zod schema in `@repo/contracts/profile` through Drizzle into the
  database, and back to the React form.
- Optional and nullable everywhere. A user with no bio yet reads as
  `aboutMe: null`.
- Validate at the API boundary: a `.refine()` on the partial-update schema
  rejects payloads whose stringified Delta exceeds **50 KB**. Returns
  `400 VALIDATION_ERROR`.
- Single API touchpoint: piggyback on the existing
  `PATCH /api/users/me/profile`. No new endpoint.

## 2. Non-goals

- **No localisation.** `aboutMe` is single-value; users write in their
  preferred language. The codebase's localised-content pattern
  (belt-rank descriptions × EN/SV/FI) is right for admin-authored, formally
  translated content and wrong for self-authored bios.
- **No public profile page.** taidohub has no public user profiles;
  `aboutMe` is visible only on the self-service profile page and the admin
  read-only Profile tab. (If a public user surface ever lands, it can opt
  in to `<QuillViewer>` then.)
- **No image upload.** The editor's toolbar excludes images by spec.
- **No `dangerouslySetInnerHTML`.** Quill renders the Delta itself; the
  editor spec already covered this.
- **No database-side size cap.** Postgres handles arbitrary `jsonb`; we
  enforce size only at the API boundary so the cap can move without a
  migration.
- **No size cap on the read schema.** Validation only runs on PATCH
  payloads — readers must accept whatever was already stored.
- **No backfill.** Existing `user_profile` rows get `NULL` for `about_me`
  and that is the correct default.

## 3. Decisions locked during brainstorming

1. **Single value, not localised** — users author once in their preferred
   language; no expectation of self-translation.
2. **Typed Delta object in the contract + `jsonb` column in the database**
   — end-to-end type safety from Zod through Drizzle, no JSON.stringify
   glue in the service or the form.
3. **Size cap: 50 KB stringified**, enforced at the boundary via a Zod
   `.refine()`.
4. **Empty-on-submit handling**: the form converts an empty Delta to
   `null` before sending (`isEmpty(value) ? null : value`). Storing an
   empty document and storing nothing should not be different states.

---

## 4. Data model

### 4.1 Migration `0012_<adjective_noun>.sql`

One additive column. No backfill.

```sql
ALTER TABLE user_profile
  ADD COLUMN about_me jsonb;
```

The column is nullable by default. No index — we never query into the JSON.

### 4.2 Drizzle schema

`apps/backend/src/infrastructure/database/schema/user-profile.ts` gains
one column inside the existing `pgTable('user_profile', { … })` block:

```ts
import { jsonb } from 'drizzle-orm/pg-core';
import type { Delta } from 'quill/core'; // type-only import; no runtime dep on the backend

// …
aboutMe: jsonb('about_me').$type<Delta | null>(),
```

The `$type<Delta | null>()` brand carries the Delta shape into Drizzle's
row-type inference without losing nullability.

`Delta` is a `quill/core` type — type-only import on the backend means
`quill` does NOT become a backend runtime dependency. The TypeScript
compiler elides type-only imports.

## 5. Contracts

`packages/contracts/src/profile.ts` gets a `DeltaSchema` and three changes:

### 5.1 `DeltaSchema` (new, file-local)

A minimal Zod definition matching the structural shape of a Quill Delta:

```ts
const DeltaSchema = z.object({
  ops: z.array(z.unknown()),
});
```

The `ops` entries themselves are not deeply validated — Quill's `formats`
allowlist on the editor side narrows what blots actually get produced, and
the read path renders whatever was stored. Zod's job is to confirm the
top-level shape and the size cap.

### 5.2 `UserProfileSchema` — gains an `aboutMe` field

```ts
aboutMe: DeltaSchema.nullable(),
```

The `example` block on the `.meta({...})` call gains an `aboutMe: { ops:
[{ insert: 'Sample bio…\n' }] }` entry for OpenAPI docs.

### 5.3 `UpdateUserProfileSchema` — gains a refined, optional, nullable field

```ts
aboutMe: DeltaSchema
  .nullable()
  .refine(
    (d) => d === null || JSON.stringify(d).length <= 50_000,
    { message: 'aboutMe exceeds 50 KB.' },
  )
  .optional(),
```

The order matters: `.nullable()` first (so `null` is a valid value),
`.refine()` next (the predicate returns `true` for `null`, and checks the
size only when present), `.optional()` last (so the field can be omitted
from the patch).

### 5.4 Inferred TS types

- `UserProfile.aboutMe: { ops: unknown[] } | null`
- `UpdateUserProfileInput.aboutMe?: { ops: unknown[] } | null | undefined`

The frontend re-narrows to `Delta` via a `as Delta` cast at the editor
boundary — the structural shapes coincide; the cast is purely a narrowing.
(An alternative is to declare `DeltaSchema` as `.transform(d => d as Delta)`
inline; either is fine. The plan picks the explicit cast for clarity.)

### 5.5 OpenAPI

`packages/contracts/openapi/openapi.{json,yaml}` regen captures the new
schema property + the example. Standard `pnpm openapi:generate` run at
plan time.

## 6. Backend

`apps/backend/src/modules/profile/profile.service.ts` is the only file with
behavioural changes. Three branches gain an `aboutMe` clause, all
mirroring the existing pattern:

### 6.1 `buildPatch(input)`

```ts
if ('aboutMe' in input) patch.aboutMe = input.aboutMe ?? null;
```

(`?? null` collapses both `null` and `undefined` to `null` — though Zod
already excludes `undefined` once the optional shape is stripped during
the `.parse()` call.)

### 6.2 `toApi(row)`

The returned `UserProfile` object gains:

```ts
aboutMe: row.aboutMe ?? null,
```

### 6.3 `emptyProfile(userId)`

The placeholder shape returned when the user has no `user_profile` row yet
gains:

```ts
aboutMe: null,
```

No new repository method. No new endpoint. The existing `PATCH
/api/users/me/profile` mechanics handle partial updates already — Zod
validates the payload, the service builds the patch, the repo upserts.

### 6.4 Backend test addition

`profile.service.spec.ts` gains one new test case under the `updateOwn`
describe block, asserting that supplying `{ aboutMe: <some delta> }`:
- lands in `repo.upsert`'s patch arg as `{ aboutMe: <that delta> }`,
- does NOT trigger the `user.name` sync (because first/last name aren't
  in the patch),
- and produces a returned profile whose `aboutMe` equals the upsert's
  returned row's `aboutMe`.

## 7. Frontend

### 7.1 `<ProfileForm>` — self-service edit

`apps/frontend/src/features/profile-form/ui/ProfileForm.tsx`:

- New import: `RichTextEditor, emptyDelta, isEmpty, type Delta` from
  `@/shared/ui`.
- New state: `const [aboutMe, setAboutMe] = React.useState<Delta>(profile.aboutMe as Delta ?? emptyDelta());`
- New `<FormField>` block beneath the citizenships section (about-me is
  the visually bulkiest field; belongs at the bottom):

  ```tsx
  <FormField>
    <Label htmlFor="profile-about-me">{t('profile.fields.aboutMe')}</Label>
    <RichTextEditor
      id="profile-about-me"
      value={aboutMe}
      onChange={setAboutMe}
      ariaLabel={t('profile.fields.aboutMe')}
      placeholder={t('profile.aboutMePlaceholder')}
    />
  </FormField>
  ```

- The submit handler's `UpdateUserProfileInput` payload gains:

  ```ts
  aboutMe: isEmpty(aboutMe) ? null : aboutMe,
  ```

### 7.2 `<UserForm>` Profile tab — admin read-only

`apps/frontend/src/features/user-form/ui/UserForm.tsx`'s existing read-only
Profile tab (a `<dl>` of name/value pairs) gains one new row at the
bottom:

```tsx
<dt className="text-on-surface-variant">{t('profile.fields.aboutMe')}</dt>
<dd>
  {profile?.aboutMe && !isEmpty(profile.aboutMe as Delta)
    ? <QuillViewer value={profile.aboutMe as Delta} />
    : '—'}
</dd>
```

New imports: `QuillViewer, isEmpty, type Delta` from `@/shared/ui`. The
profile-empty banner the tab already shows when the user has no
`user_profile` row at all doesn't change.

### 7.3 Tests

- **`ProfileForm.test.tsx`** — one new case: renders with a seeded
  `aboutMe` and shows a Quill `.ql-toolbar` for the field. (Same jsdom
  polyfill caveat as in the rich-text editor spec.)
- **`UserForm.test.tsx`** — one new case in the Profile-tab describe:
  asserts the row renders `<QuillViewer>` when `aboutMe` is set;
  asserts `'—'` when `aboutMe` is null.

No new test files — only additions to existing suites.

## 8. i18n

Two new keys × three locales (en/sv/fi) under `profile.fields.*` and
`profile.*`:

- `profile.fields.aboutMe`
  - en: `"About me"`
  - sv: `"Om mig"`
  - fi: `"Tietoa minusta"`
- `profile.aboutMePlaceholder`
  - en: `"Share a little about your taido journey, interests, or background."`
  - sv: `"Skriv lite om din taidoresa, intressen eller bakgrund."`
  - fi: `"Kerro hieman taidopolustasi, kiinnostuksen kohteistasi tai taustastasi."`

The existing `profile.empty` admin-side string (shown when the user has no
profile row at all) is unchanged.

## 9. Testing strategy summary

| Layer | Test | Where |
|---|---|---|
| Contracts | `UpdateUserProfileSchema` accepts a valid Delta | `packages/contracts/src/__tests__/profile.test.ts` (new case) |
| Contracts | `UpdateUserProfileSchema` rejects an oversized Delta (>50 KB stringified) | same file (new case) |
| Contracts | `UserProfileSchema` accepts `aboutMe: null` and a Delta | same file (new case) |
| Backend | `ProfileService.updateOwn` propagates `aboutMe` to `repo.upsert` | `profile.service.spec.ts` (new case) |
| Frontend | `<ProfileForm>` renders editor with seeded `aboutMe` | `ProfileForm.test.tsx` (new case) |
| Frontend | `<UserForm>` Profile tab renders `<QuillViewer>` when `aboutMe` is set; `'—'` when null | `UserForm.test.tsx` (new case) |

We don't keyboard-test the editor under jsdom (same rationale as the
rich-text editor spec).

## 10. Migration / backwards-compat

- Migration `0012` is additive only: one new nullable column on
  `user_profile`. No backfill. No data conversion.
- Existing API consumers begin receiving `aboutMe: null` on every read.
  Pre-existing readers ignoring unknown fields keep working.
- Existing API callers that omit `aboutMe` from `PATCH` payloads see no
  behaviour change — Drizzle's `onConflictDoUpdate({ set: patch })` only
  writes the keys named in `patch`.
- Existing tests stay green throughout.

## 11. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 50 KB cap is too tight (bios with embedded base64 or copy-paste with formatting balloon Delta size) | Low | Low | Cap lives at the API boundary; raise via a one-line change. No migration required. |
| `Delta` type drifts between frontend (`quill/core`) and backend (also `quill/core` as type-only import) | Low | Low | Both sides type-only-import from the same package; runtime structural shape is `{ ops: unknown[] }` which matches Zod. |
| `as Delta` cast hides a real shape mismatch | Low | Low | Zod parses the same shape (`{ ops: unknown[] }`) on the way in. Cast is a narrowing, not a coercion. |
| Pre-existing `ProfileForm` test breaks because the form's submit payload shape changes | Medium | Low | The form's existing test seeds an empty profile and asserts `updateMyProfile` was called with the patch — the new field defaults to `aboutMe: null` (because `isEmpty(emptyDelta())` is true). The assertion either matches loosely or gains a single new property — minor edit. |
| `<UserForm>` Profile-tab test breaks if it asserts the exact set of `<dt>` labels | Low | Low | The test currently asserts presence of fields, not exhaustive equality. New row is additive. |

## 12. Deliberate scope decisions (recap)

- Single-value `aboutMe`, not localised.
- `jsonb` column + typed Delta in contracts.
- 50 KB stringified cap at the API boundary; nothing at the DB level.
- "Cleared editor" submits as `null`, not as an empty document.
- Read-only admin display via `<QuillViewer>`; same MD3-themed surface as
  the editor.
- No new endpoints, no new module, no new repository method.
- One backend service spec case, one contracts case, two frontend cases.

## 13. Suggested next steps

1. Self-review this spec (per the brainstorming workflow).
2. Move to writing-plans for the implementation plan (~9 small tasks per
   §10 of the brainstorming summary).
3. Subagent-driven execution, single feature branch, single merge.

The plan's task decomposition will mirror the user-profile and rank-history
shipped features: contracts → DB migration → backend → frontend → i18n →
OpenAPI regen → full pipeline.
