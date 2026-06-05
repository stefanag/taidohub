# `aboutMe` Profile Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, single-language `aboutMe` rich-text field to the
user profile end-to-end — DB column + contract schema + backend service +
self-service editor in `<ProfileForm>` + read-only admin viewer in the
`<UserForm>` Profile tab.

**Architecture:** A new `jsonb` column on `user_profile`, exposed as a
typed `Delta`-shaped object through `@repo/contracts/profile`, validated at
the API boundary with a 50 KB stringified size cap. The frontend reuses
the previously-shipped `<RichTextEditor>` for edit and `<QuillViewer>`
for display. No new endpoint, no new module, no new repository method.

**Tech Stack:** Zod 4 (`@repo/contracts`), Drizzle ORM + PostgreSQL,
NestJS 11, React 19 + Vite, Vitest, `react-quill-new` (already installed).

**Spec:** [`docs/superpowers/specs/2026-05-27-profile-about-me-design.md`](../specs/2026-05-27-profile-about-me-design.md)

**Windows env notes:**
- `pnpm --filter backend typecheck` and `pnpm --filter frontend typecheck`
  sometimes hang on this machine. Use direct `cd apps/backend && npx tsc --noEmit`
  or `cd apps/frontend && npx tsc --noEmit`.
- Tests via `pnpm --filter <pkg> exec vitest run [path]` are reliable.
- Kill stale node processes via PowerShell if anything wedges:
  `Get-Process node | Stop-Process -Force`.

**One small deviation from spec text** (for the implementer): the backend
Drizzle column uses an inline structural shape `{ ops: unknown[] } | null`
instead of `Delta | null` imported from `quill/core`. Reason: the backend
has no `quill` runtime or dev dependency, and a type-only import still
requires the package to be resolvable. The structural shape is identical;
the spec's safety intent (typed JSON, not `unknown`) is preserved.

---

### Task 1: Contracts — `DeltaSchema` + `aboutMe` on `UserProfileSchema` + `UpdateUserProfileSchema`

**Files:**
- Modify: `packages/contracts/src/profile.ts`
- Modify: `packages/contracts/src/__tests__/profile.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/contracts/src/__tests__/profile.test.ts` and add six new
cases. Add them at the end of the existing `describe` blocks (preserve all
existing cases — these are additive):

```ts
import { describe, expect, it } from 'vitest';

import { UpdateUserProfileSchema, UserProfileSchema } from '../profile.js';

// Reuse the small fixture helpers at the top of the file. The cases below
// only test the new field; existing fixtures cover the other properties.

describe('UserProfileSchema — aboutMe', () => {
  const baseRow = {
    userId: 'u-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1990-12-10',
    taidoStartDate: '2015-09-01',
    addressStreet: '12 Analytical Way',
    addressPostalCode: '11122',
    addressCity: 'Stockholm',
    addressCountry: 'SWE' as const,
    citizenships: ['SWE', 'GBR'],
  };

  it('accepts aboutMe: null', () => {
    expect(UserProfileSchema.safeParse({ ...baseRow, aboutMe: null }).success).toBe(true);
  });

  it('accepts a Delta-shaped aboutMe', () => {
    expect(
      UserProfileSchema.safeParse({
        ...baseRow,
        aboutMe: { ops: [{ insert: 'Sample bio\n' }] },
      }).success,
    ).toBe(true);
  });

  it('rejects aboutMe with a non-array ops field', () => {
    expect(
      UserProfileSchema.safeParse({ ...baseRow, aboutMe: { ops: 'nope' } }).success,
    ).toBe(false);
  });
});

describe('UpdateUserProfileSchema — aboutMe', () => {
  it('accepts an empty patch (no aboutMe key)', () => {
    expect(UpdateUserProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts aboutMe: null', () => {
    expect(UpdateUserProfileSchema.safeParse({ aboutMe: null }).success).toBe(true);
  });

  it('accepts a small Delta', () => {
    expect(
      UpdateUserProfileSchema.safeParse({
        aboutMe: { ops: [{ insert: 'Short bio\n' }] },
      }).success,
    ).toBe(true);
  });

  it('rejects a Delta whose stringified size exceeds 50 KB', () => {
    // Build a Delta whose JSON.stringify length crosses 50 000.
    // A single op with a 60 000-char insert clears the cap by a wide margin.
    const big = 'x'.repeat(60_000);
    expect(
      UpdateUserProfileSchema.safeParse({ aboutMe: { ops: [{ insert: big }] } }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter @repo/contracts exec vitest run src/__tests__/profile.test.ts
```

Expected: FAIL — the cases that supply `aboutMe` get rejected because the
field isn't on the schema yet (Zod's default behaviour with unknown keys is
to strip them, but `safeParse` succeeds for those cases — the rejection
comes from the size-cap test once aboutMe is added). Specifically you'll see
the **"rejects a Delta with non-array ops field"** and **"rejects a Delta
whose stringified size exceeds 50 KB"** failing because the field doesn't
exist yet so the schema doesn't validate it. The acceptance cases pass
because Zod silently drops unknown keys.

(If everything passes, then Zod is silently dropping `aboutMe` — proving the
field hasn't been added. Move on to Step 3 regardless.)

- [ ] **Step 3: Add `DeltaSchema` + `aboutMe` to `packages/contracts/src/profile.ts`**

Open the file. Just after the existing `CountryCodeSchema` declaration
(roughly line 20), add a file-local schema for Delta:

```ts
/**
 * A minimal Quill Delta — `{ ops: unknown[] }`. The per-op shape isn't
 * deeply validated here: Quill's `formats` allowlist on the editor side
 * narrows what blots actually get produced, and the read path renders
 * whatever was stored. Zod confirms the top-level shape (and, for PATCH
 * payloads, the size cap).
 */
const DeltaSchema = z.object({
  ops: z.array(z.unknown()),
});
```

Then update `UserProfileSchema` — add `aboutMe: DeltaSchema.nullable(),` to
the `.object({...})` block (after `citizenships`):

```ts
export const UserProfileSchema = z
  .object({
    userId: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    dateOfBirth: z.string().date().nullable(),
    taidoStartDate: z.string().date().nullable(),
    addressStreet: z.string().nullable(),
    addressPostalCode: z.string().nullable(),
    addressCity: z.string().nullable(),
    addressCountry: CountryCodeSchema.nullable(),
    citizenships: CountryCodeSchema.array(),
    aboutMe: DeltaSchema.nullable(),
  })
  .meta({
    id: 'UserProfile',
    description: "A user's self-service profile — personal and taido-training details.",
    example: {
      userId: 'u-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1990-12-10',
      taidoStartDate: '2015-09-01',
      addressStreet: '12 Analytical Way',
      addressPostalCode: '11122',
      addressCity: 'Stockholm',
      addressCountry: 'SWE',
      citizenships: ['SWE', 'GBR'],
      aboutMe: { ops: [{ insert: 'Started taido in 2015 …\n' }] },
    },
  });
```

Then update `UpdateUserProfileSchema` — add the size-capped, optional,
nullable variant after `citizenships`:

```ts
export const UpdateUserProfileSchema = z
  .object({
    firstName: z.string().max(200).nullable().optional(),
    lastName: z.string().max(200).nullable().optional(),
    dateOfBirth: z.string().date().nullable().optional(),
    taidoStartDate: z.string().date().nullable().optional(),
    addressStreet: z.string().max(300).nullable().optional(),
    addressPostalCode: z.string().max(20).nullable().optional(),
    addressCity: z.string().max(200).nullable().optional(),
    addressCountry: CountryCodeSchema.nullable().optional(),
    citizenships: CountryCodeSchema.array().optional(),
    aboutMe: DeltaSchema
      .nullable()
      .refine(
        (d) => d === null || JSON.stringify(d).length <= 50_000,
        { message: 'aboutMe exceeds 50 KB.' },
      )
      .optional(),
  })
  .meta({
    id: 'UpdateUserProfileInput',
    description: 'A partial profile patch — omit a field to leave it unchanged.',
    example: { firstName: 'Ada', lastName: 'Lovelace', citizenships: ['SWE', 'GBR'] },
  });
```

(`.nullable()` before `.refine()` so `null` is a valid passing value;
`.optional()` last so the field can be omitted from the patch.)

- [ ] **Step 4: Build the contracts package + re-run tests — expect PASS**

```
pnpm --filter @repo/contracts build
pnpm --filter @repo/contracts exec vitest run
```

Expected: PASS — the full `@repo/contracts` test suite stays green and
the new 6 cases pass.

- [ ] **Step 5: Direct typecheck**

```
cd packages/contracts && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add packages/contracts/src/profile.ts packages/contracts/src/__tests__/profile.test.ts
git commit -m "feat(contracts): aboutMe Delta field on UserProfile + UpdateUserProfileInput with 50KB cap"
```

---

### Task 2: DB — migration 0012 + Drizzle `about_me` column

**Files:**
- Modify: `apps/backend/src/infrastructure/database/schema/user-profile.ts`
- Generated: `apps/backend/drizzle/0012_<adjective_noun>.sql` (drizzle-kit names it)
- Generated: `apps/backend/drizzle/meta/0012_snapshot.json`
- Modified: `apps/backend/drizzle/meta/_journal.json`

- [ ] **Step 1: Add the `aboutMe` column to the Drizzle schema**

Open `apps/backend/src/infrastructure/database/schema/user-profile.ts`. At
the top, add `jsonb` to the `drizzle-orm/pg-core` import. Inside the
`pgTable('user_profile', { … })` body, add `aboutMe` after the existing
`citizenships` (or `shogoTitle`) line — match the existing field order in
the file:

```ts
import {
  boolean,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
```

(The exact existing import set may differ — add `jsonb` to whatever's
already there.)

In the table body, add the column. Use an inline structural type
(`{ ops: unknown[] } | null`) rather than importing `Delta` from
`quill/core` — the backend has no `quill` dep, and the structural shape
is the same value Zod validates at the API boundary.

```ts
aboutMe: jsonb('about_me').$type<{ ops: unknown[] } | null>(),
```

- [ ] **Step 2: Generate the migration**

```
pnpm --filter backend exec drizzle-kit generate
```

Expected: drizzle-kit prints `[✓] Your SQL migration file ➜
drizzle/0012_<adjective_noun>.sql 🚀`, creates the new SQL file with a
single `ALTER TABLE` statement, writes
`drizzle/meta/0012_snapshot.json`, and appends to `drizzle/meta/_journal.json`.

- [ ] **Step 3: Read the generated SQL and confirm it's purely additive**

```
cat apps/backend/drizzle/0012_*.sql
```

Expected output looks like:

```sql
ALTER TABLE "user_profile" ADD COLUMN "about_me" jsonb;
```

If drizzle-kit generated anything else (drops, renames, alters on other
tables), abort and investigate — the change is meant to be purely
additive.

- [ ] **Step 4: Direct typecheck**

```
cd apps/backend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/infrastructure/database/schema/user-profile.ts apps/backend/drizzle/0012_*.sql apps/backend/drizzle/meta/0012_snapshot.json apps/backend/drizzle/meta/_journal.json
git commit -m "feat(db): user_profile.about_me jsonb column + migration 0012"
```

---

### Task 3: Backend — `ProfileService.buildPatch` + `toApi` + `emptyProfile` + spec case

**Files:**
- Modify: `apps/backend/src/modules/profile/profile.service.ts`
- Modify: `apps/backend/src/modules/profile/profile.service.spec.ts`

- [ ] **Step 1: Write the failing spec case**

Open `apps/backend/src/modules/profile/profile.service.spec.ts`. Find the
`describe('updateOwn', …)` block and add a new case at the end (preserve
all existing cases):

```ts
it('propagates aboutMe through buildPatch without triggering user.name sync', async () => {
  const seededRow = {
    userId: 'u-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    aboutMe: null,
    // … other fields omitted (the stub doesn't care for this test)
  };
  const aboutMe = { ops: [{ insert: 'Started taido in 2015\n' }] };

  // Existing test fixtures set up `repo.findByUserId.mockResolvedValue(seededRow)`
  // and `repo.upsert.mockResolvedValue({ ...seededRow, aboutMe })`. If the
  // existing fixture helpers in this file use slightly different names,
  // adapt these two lines to match.
  repo.findByUserId.mockResolvedValue(seededRow);
  repo.upsert.mockResolvedValue({ ...seededRow, aboutMe });

  const result = await service.updateOwn({ id: 'u-1' } as never, { aboutMe });

  // Patch arrived intact at the repository.
  expect(repo.upsert).toHaveBeenCalledTimes(1);
  const [, patch] = repo.upsert.mock.calls[0]!;
  expect(patch).toEqual({ aboutMe });

  // No name sync was attempted (no first/last in the patch).
  expect(repo.syncUserName).not.toHaveBeenCalled();

  // Returned API object exposes aboutMe.
  expect(result.aboutMe).toEqual(aboutMe);
});
```

Implementer note: the existing test file at the top already declares the
`repo`, `service`, and any fixture helpers (`seededRow`, etc.) used by the
other `updateOwn` cases. Reuse them; the snippet above shows the assertion
shape, not a full standalone fixture.

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend exec vitest run src/modules/profile/profile.service.spec.ts
```

Expected: FAIL — the new case fails because `ProfileService.buildPatch`
doesn't recognise `aboutMe`, so it never lands in the upsert patch. The
test's `expect(patch).toEqual({ aboutMe })` will see an empty `{}` patch.

- [ ] **Step 3: Add the `aboutMe` branches to `ProfileService`**

Open `apps/backend/src/modules/profile/profile.service.ts`. In
`buildPatch`, add the new branch after the existing ones:

```ts
if ('aboutMe' in input) patch.aboutMe = input.aboutMe ?? null;
```

In `toApi`, add `aboutMe` to the returned object:

```ts
return {
  userId: row.userId,
  firstName: row.firstName ?? null,
  lastName: row.lastName ?? null,
  dateOfBirth: row.dateOfBirth ?? null,
  taidoStartDate: row.taidoStartDate ?? null,
  addressStreet: row.addressStreet ?? null,
  addressPostalCode: row.addressPostalCode ?? null,
  addressCity: row.addressCity ?? null,
  addressCountry: row.addressCountry ?? null,
  citizenships: row.citizenships ?? [],
  aboutMe: row.aboutMe ?? null,
};
```

(Match the exact shape of the existing `toApi` — add `aboutMe: row.aboutMe ?? null,`
as the last field.)

In `emptyProfile`, add `aboutMe: null` to the placeholder shape:

```ts
return {
  userId,
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  taidoStartDate: null,
  addressStreet: null,
  addressPostalCode: null,
  addressCity: null,
  addressCountry: null,
  citizenships: [],
  aboutMe: null,
};
```

- [ ] **Step 4: Re-run the backend spec suite — expect PASS**

```
pnpm --filter backend exec vitest run src/modules/profile/profile.service.spec.ts
```

Expected: PASS — every pre-existing `ProfileService` case stays green, AND
the new `aboutMe` case passes.

- [ ] **Step 5: Direct backend typecheck**

```
cd apps/backend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/profile/profile.service.ts apps/backend/src/modules/profile/profile.service.spec.ts
git commit -m "feat(profile): ProfileService propagates aboutMe through buildPatch + toApi + emptyProfile"
```

---

### Task 4: Frontend — `<ProfileForm>` editor wiring

**Files:**
- Modify: `apps/frontend/src/features/profile-form/ui/ProfileForm.tsx`
- Modify: `apps/frontend/src/features/profile-form/ui/ProfileForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `apps/frontend/src/features/profile-form/ui/ProfileForm.test.tsx`. At
the top of the file, ensure the Quill jsdom polyfills are in place (they
already shipped with the rich-text editor tests; the form test inherits
the same renderer needs):

```ts
import { beforeAll } from 'vitest';

beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
});
```

(If the file already has a `beforeAll` near the top, append these
polyfills to it — don't add a second `beforeAll`.)

Add a new test case at the end of the file's existing `describe`:

```ts
it('renders the about-me rich text editor seeded from the profile', () => {
  const onSubmit = vi.fn();
  const profileWithBio = {
    ...EMPTY_PROFILE,
    aboutMe: { ops: [{ insert: 'Seeded bio\n' }] },
  };

  const { container } = render(
    <ProfileForm profile={profileWithBio} onSubmit={onSubmit} />,
  );

  // The editor renders a Quill snow toolbar.
  expect(container.querySelector('.ql-toolbar')).not.toBeNull();
  // And the seeded text appears in the editable region.
  expect(container.querySelector('.ql-editor')?.textContent).toContain('Seeded bio');
});
```

The `EMPTY_PROFILE` constant is the existing test fixture — reuse what's
already in the file.

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/features/profile-form/ui/ProfileForm.test.tsx
```

Expected: FAIL — the new case fails because the form has no Quill
toolbar yet.

- [ ] **Step 3: Wire the editor into `ProfileForm.tsx`**

Open `apps/frontend/src/features/profile-form/ui/ProfileForm.tsx`. Add
imports at the top:

```ts
import {
  RichTextEditor,
  emptyDelta,
  isEmpty,
  type Delta,
} from '@/shared/ui';
```

In the component body, add new state alongside the existing `useState`
hooks:

```ts
const [aboutMe, setAboutMe] = React.useState<Delta>(
  (profile.aboutMe as Delta | null) ?? emptyDelta(),
);
```

In the JSX, add a new `<FormField>` block as the **last** entry under the
existing fields (after citizenships, before the submit button):

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

In the submit handler that builds the `UpdateUserProfileInput`, add
`aboutMe` to the payload — converting empty Delta to null so "cleared
editor" stores as `null`, not as an empty document:

```ts
const payload: UpdateUserProfileInput = {
  firstName,
  lastName,
  dateOfBirth: dateOfBirth || null,
  taidoStartDate: taidoStartDate || null,
  addressStreet,
  addressPostalCode,
  addressCity,
  addressCountry,
  citizenships,
  aboutMe: isEmpty(aboutMe) ? null : aboutMe,
};
```

(Match the field names + shape the existing handler uses; the relevant
change is the trailing `aboutMe` line.)

- [ ] **Step 4: Re-run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/profile-form/ui/ProfileForm.test.tsx
```

Expected: PASS — the new case + all pre-existing form cases stay green.

- [ ] **Step 5: Direct frontend typecheck**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/features/profile-form/ui/ProfileForm.tsx apps/frontend/src/features/profile-form/ui/ProfileForm.test.tsx
git commit -m "feat(profile-form): aboutMe RichTextEditor field with empty-to-null submit"
```

---

### Task 5: Frontend — `<UserForm>` Profile tab QuillViewer wiring

**Files:**
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.tsx`
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`. Ensure
the Quill polyfills are at the top (same `beforeAll` block as Task 4 — if
the file already has one for the existing Profile-tab tests or the
Grading-history tab, extend it; otherwise add a new one).

Add two new cases inside the Profile-tab describe block:

```ts
it('renders the about-me QuillViewer when the profile carries aboutMe', async () => {
  const profileWithBio = {
    ...PROFILE_FIXTURE,
    aboutMe: { ops: [{ insert: 'My bio\n' }] },
  };
  mockedGetProfile.mockResolvedValue(profileWithBio);

  const { container, user } = renderUserForm();
  await user.click(screen.getByRole('tab', { name: /profile/i }));

  // QuillViewer renders a Quill instance — its read-only editor body has
  // contenteditable="false" and reflects the seeded text.
  const viewer = await waitFor(() =>
    container.querySelector('.ql-editor[contenteditable="false"]')
  );
  expect(viewer).not.toBeNull();
  expect(viewer?.textContent).toContain('My bio');
});

it('shows an em-dash placeholder when aboutMe is null', async () => {
  const profileWithoutBio = { ...PROFILE_FIXTURE, aboutMe: null };
  mockedGetProfile.mockResolvedValue(profileWithoutBio);

  const { user } = renderUserForm();
  await user.click(screen.getByRole('tab', { name: /profile/i }));

  // The About-me row's <dd> shows an em-dash (—) when the bio is null.
  // Scope by querying for the label first, then asserting the sibling text.
  const label = await screen.findByText(/about me/i);
  const row = label.closest('div, dl, dt')?.parentElement;
  expect(row?.textContent).toContain('—');
});
```

(`PROFILE_FIXTURE` and `mockedGetProfile` and `renderUserForm` are the
existing helpers/spies at the top of the file from the user-profile feature.
Adapt the new cases to match the exact names used in the file.)

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/features/user-form/ui/UserForm.test.tsx
```

Expected: FAIL — the new cases fail because the Profile tab has no
about-me row yet.

- [ ] **Step 3: Wire the QuillViewer into `<UserForm>`**

Open `apps/frontend/src/features/user-form/ui/UserForm.tsx`. Add imports:

```ts
import { QuillViewer, isEmpty, type Delta } from '@/shared/ui';
```

Find the read-only Profile tab's `<dl>` (the `<TabsContent value="profile">`
block). Add a new `<dt>`/`<dd>` row as the **last** entry — after the
citizenships row:

```tsx
<dt className="text-on-surface-variant">{t('profile.fields.aboutMe')}</dt>
<dd>
  {profile?.aboutMe && !isEmpty(profile.aboutMe as Delta)
    ? <QuillViewer value={profile.aboutMe as Delta} />
    : '—'}
</dd>
```

(`profile` is the existing tab-scoped variable populated by the profile
query. If the variable has a different name in the current file —
`profileQuery.data` or similar — use that.)

- [ ] **Step 4: Re-run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/user-form/ui/UserForm.test.tsx
```

Expected: PASS — both new cases + all pre-existing UserForm cases stay
green.

- [ ] **Step 5: Direct frontend typecheck**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/features/user-form/ui/UserForm.tsx apps/frontend/src/features/user-form/ui/UserForm.test.tsx
git commit -m "feat(user-form): aboutMe QuillViewer row in the admin Profile tab"
```

---

### Task 6: i18n — `profile.fields.aboutMe` + `profile.aboutMePlaceholder` × en/sv/fi

**Files:**
- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Add keys to `en.json`**

Inside the existing `profile.fields` block, add `aboutMe`. Inside the
parent `profile` block (sibling of `fields`), add `aboutMePlaceholder`:

```jsonc
{
  "profile": {
    "fields": {
      // … existing keys …
      "aboutMe": "About me"
    },
    "aboutMePlaceholder": "Share a little about your taido journey, interests, or background."
    // … other existing profile.* keys (title, description, etc.) …
  }
}
```

(Mirror whatever key ordering is already in the file — don't reorder
existing keys.)

- [ ] **Step 2: Add keys to `sv.json`**

```jsonc
{
  "profile": {
    "fields": {
      "aboutMe": "Om mig"
    },
    "aboutMePlaceholder": "Skriv lite om din taidoresa, intressen eller bakgrund."
  }
}
```

- [ ] **Step 3: Add keys to `fi.json`**

```jsonc
{
  "profile": {
    "fields": {
      "aboutMe": "Tietoa minusta"
    },
    "aboutMePlaceholder": "Kerro hieman taidopolustasi, kiinnostuksen kohteistasi tai taustastasi."
  }
}
```

- [ ] **Step 4: Verify the JSON files are valid + run a smoke vitest scope**

```
cd apps/frontend && npx tsc --noEmit
pnpm --filter frontend exec vitest run src/features/profile-form src/features/user-form
```

Expected: PASS — both suites stay green; typecheck has no JSON parse
errors.

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/i18n/locales/en.json apps/frontend/src/i18n/locales/sv.json apps/frontend/src/i18n/locales/fi.json
git commit -m "feat(i18n): profile.fields.aboutMe + profile.aboutMePlaceholder (en/sv/fi)"
```

---

### Task 7: Regenerate OpenAPI

**Files:**
- Modify: `packages/contracts/openapi/openapi.json` (regenerated)
- Modify: `packages/contracts/openapi/openapi.yaml` (regenerated)

- [ ] **Step 1: Regenerate**

```
pnpm openapi:generate
```

Expected: writes the regenerated `openapi.{json,yaml}`. Adds the
`aboutMe` property to the `UserProfile` schema entry and to
`UpdateUserProfileInput`, plus an example value.

- [ ] **Step 2: Inspect the diff**

```
git status --short packages/contracts/openapi
git diff packages/contracts/openapi
```

Expected: only the two files modified. The diff includes new `aboutMe`
property entries on the two schemas; nothing else moves.

- [ ] **Step 3: Commit**

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(contracts): regen OpenAPI after UserProfile.aboutMe addition"
```

---

### Task 8: Full pipeline + clean tree confirmation

**Files:**
- (no source files — verification task; no commit expected)

- [ ] **Step 1: Frontend full suite**

```
cd apps/frontend && npx vitest run
```

Expected: PASS — every existing test stays green PLUS the new aboutMe
cases (1 in ProfileForm, 2 in UserForm, 6 in contracts).

- [ ] **Step 2: Backend full suite**

```
pnpm --filter backend exec vitest run
```

Expected: PASS — every existing test stays green PLUS the new
`ProfileService.updateOwn aboutMe` case.

- [ ] **Step 3: Contracts full suite**

```
pnpm --filter @repo/contracts exec vitest run
```

Expected: PASS — every existing test stays green PLUS the new 6 cases on
the profile schemas.

- [ ] **Step 4: Direct typechecks**

```
cd apps/frontend && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
cd ../../packages/contracts && npx tsc --noEmit
```

Expected: PASS — exit 0 on each.

- [ ] **Step 5: Steiger arch lint (frontend)**

```
cd apps/frontend && npm run arch
```

Expected: 0 errors. Pre-existing `fsd/insignificant-slice` warnings are
fine — no new errors should appear.

- [ ] **Step 6: Frontend build**

```
cd apps/frontend && npx vite build
```

Expected: `built in N.NN s`. The chunk-size warning from Quill is
unchanged from baseline.

- [ ] **Step 7: Confirm clean working tree**

```
git status --short
```

Expected: empty — nothing uncommitted. If anything's modified, investigate
and revert before continuing.

- [ ] **Step 8: (Optional) Manual verification**

The migration `0012` isn't applied automatically — apply it to your dev
database:

```
pnpm --filter backend exec drizzle-kit migrate
```

Then start the frontend dev server (`pnpm --filter frontend dev`), sign
in, navigate to `/profile`, scroll to the **About me** field at the
bottom. Type a few lines, format some text, save. Reload — your formatted
content reappears. As a sysadmin, open `/admin/users`, edit your own
user, switch to the Profile tab — the About-me row renders read-only via
`<QuillViewer>` with the same MD3-themed surface.

---

## Notes

- **No new endpoint.** The existing `PATCH /api/users/me/profile` carries
  the new field — no module change, no controller change, no repository
  method change.
- **No DB-side size cap.** The 50 KB cap lives at the Zod boundary so it
  can be raised/lowered with a one-line schema change and no migration.
- **Cleared editor → null.** The form converts `isEmpty(aboutMe) ? null :
  aboutMe` on submit so we never persist a Delta whose only content is the
  trailing newline.
- **Type-only narrowing on the frontend.** The contract infers `aboutMe`
  as `{ ops: unknown[] } | null`; the form and the viewer use `as Delta` to
  narrow to Quill's structurally-identical type at the editor boundary.
  No runtime coercion.
- **Quill polyfills in tests.** ProfileForm and UserForm tests both gain
  `Range.prototype.getBoundingClientRect` and `Range.prototype.getClientRects`
  polyfills at the top of their files — same pattern the rich-text editor
  tests already use.
- **OpenAPI drift caught at Task 7.** If the regen produces unexpected
  diffs (anything beyond the two `aboutMe` property entries), investigate
  before committing.
