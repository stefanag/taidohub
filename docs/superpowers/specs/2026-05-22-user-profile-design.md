# User Profile Design

**Status:** approved design — not yet implemented.

**Date:** 2026-05-22

**Author:** Stefan (with Claude)

**Context:** The user-management feature (Phases 1–3) is shipped: a four-role
model, an admin `/admin/users` surface, and the invite / add-user / lifecycle
flows. This spec adds a **self-service user profile** — every authenticated
user can record and edit their own personal and taido-training details, and a
sysadmin can view (read-only) any user's profile.

---

## 1. Goals

An authenticated user can manage their own profile:

- **First name** and **Last name** — these become the source of truth for the
  user's name. The existing `user.name` display field is kept auto-synced to
  `"First Last"` so the sidebar, the admin user list, and the audit log keep
  working unchanged.
- **Date of birth.**
- **Taido training start date** — when the user started training taido.
- **Address** — structured: street address, postal code, city, country.
- **Citizenship** — one or more countries (dual/triple citizenship supported).

A **sysadmin** can additionally view (read-only) any user's profile from the
admin user surface.

All profile fields are optional; a user fills them in over time.

---

## 2. Non-goals (v1)

- **Sysadmin editing of other users' profiles.** Sysadmins can *view* a
  profile; editing it is the user's own responsibility. Reconsider later.
- **Auditing self-profile edits.** A user editing their own low-risk personal
  data is not written to the audit log. The audit log stays focused on
  admin-initiated actions. (The `user.name` sync is likewise not audited.)
- **Reconciling the admin user-form's `name` field with profile First/Last.**
  The admin `<UserForm>` Details tab keeps its existing `name` field unchanged.
  When a user saves their profile, `user.name` is synced from First/Last; an
  admin can still set `name` directly. The two can momentarily diverge and a
  profile save reconciles them — fully unifying the admin name editing with the
  profile is out of scope.
- **Avatar / profile image.** `user.image` already exists and is untouched.
- **Querying users by citizenship or address.** Citizenships are stored as an
  array column, not a normalized join table — there is no requirement to filter
  users by citizenship.
- **Profile completeness enforcement / prompts.** No "your profile is X%
  complete" nudges.

---

## 3. Data model

### 3.1 New table: `user_profile`

A one-to-one extension of the better-auth `user` table. A separate table keeps
the better-auth-managed `user` table clean and lets the structured address and
the citizenship array model naturally.

```
user_id              text         primary key  references user(id) on delete cascade
first_name           text         null
last_name            text         null
date_of_birth        date         null
taido_start_date     date         null
address_street       text         null
address_postal_code  text         null
address_city         text         null
address_country      text         null          -- ISO 3166-1 alpha-3 country code
citizenships         text[]       not null default '{}'   -- ISO 3166-1 alpha-3 codes
created_at           timestamptz  not null default now()
updated_at           timestamptz  not null default now()
```

- `user_id` is the primary key (enforces 1:1) and an FK to `user(id)` with
  `on delete cascade` — deleting a user removes their profile.
- All personal fields are nullable; the row is created lazily on first save.
- `date_of_birth` / `taido_start_date` are SQL `date` columns (calendar dates,
  no time component).
- `citizenships` is a Postgres `text[]` column, `not null` with a default of the
  empty array — every user has a (possibly empty) list, never null.
- Column names are snake_case, consistent with the other app-domain tables
  (`organisations`, `audit_log`, `organisation_membership`); Drizzle maps them
  to camelCase TS fields.

Created in migration `0010_*.sql` (the most recent migration is `0009`).

### 3.2 Country codes

`address_country` and the entries of `citizenships` are ISO 3166-1 alpha-3
country codes (e.g. `SWE`), the same representation `organisations.country`
already uses. The frontend's country picker reuses whatever country
list/options the organisation form already uses for its `country` field.

---

## 4. Contracts (`@repo/contracts`)

A new file `packages/contracts/src/profile.ts`, exported via a new subpath
export `@repo/contracts/profile`.

```ts
// The full profile as returned by the API.
UserProfileSchema = z.object({
  userId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  dateOfBirth: <ISO date string 'YYYY-MM-DD'>.nullable(),
  taidoStartDate: <ISO date string 'YYYY-MM-DD'>.nullable(),
  addressStreet: z.string().nullable(),
  addressPostalCode: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressCountry: z.string().nullable(),
  citizenships: z.string().array(),
});

// The editable subset — a partial PATCH. Every field optional (omitted = no
// change). Clearable text/date fields are nullable so a user can blank them.
UpdateUserProfileSchema = z.object({
  firstName: z.string().max(200).nullable().optional(),
  lastName: z.string().max(200).nullable().optional(),
  dateOfBirth: <ISO date string>.nullable().optional(),
  taidoStartDate: <ISO date string>.nullable().optional(),
  addressStreet: z.string().max(300).nullable().optional(),
  addressPostalCode: z.string().max(20).nullable().optional(),
  addressCity: z.string().max(200).nullable().optional(),
  addressCountry: z.string().nullable().optional(),
  citizenships: z.string().array().optional(),
});
```

Date fields are ISO calendar-date strings (`YYYY-MM-DD`), validated with Zod's
date format. Both schemas get `.meta({ id })` entries and are added to a
`ProfileOpenApiRegistry` for OpenAPI generation, mirroring `UsersOpenApiRegistry`.

Route constants — add to `UsersRoutes` in `packages/contracts/src/routes.ts`:

```ts
meProfile: '/api/users/me/profile',
profileById: (id: string) => `/api/users/${id}/profile`,
```

---

## 5. Backend

A new NestJS module `apps/backend/src/modules/profile/`, mirroring the shape of
the `memberships` module: `profile.controller.ts`, `profile.service.ts`,
`profile.repository.ts`, `profile.module.ts`, `dto/`, `*.spec.ts`. Registered
in `AppModule`.

### 5.1 `ProfileRepository`

The only file in the module that touches Drizzle. Methods:

- `findByUserId(userId)` → the `user_profile` row or `null`.
- `upsert(userId, patch, tx?)` → insert-or-update the `user_profile` row with
  only the explicitly-provided fields (honouring `exactOptionalPropertyTypes`).
- `syncUserName(userId, name, tx?)` → update `user.name`.

### 5.2 `ProfileService`

- `getOwn(user)` — return the caller's profile. If no `user_profile` row exists
  yet, return an **empty profile** shape (`userId` set, all personal fields
  `null`, `citizenships: []`) rather than 404. The `user_profile` table keeps
  `created_at` / `updated_at` for bookkeeping, but the API contract does not
  expose them — the profile UI has no use for them.
- `getByUserId(userId, caller)` — sysadmin-only read of any user's profile.
  Authorises with the same sysadmin gate the admin user surface uses; throws
  `NOT_FOUND` (404) if the user does not exist; returns the empty-profile shape
  if the user exists but has no profile row.
- `updateOwn(user, input)` — upsert the caller's `user_profile` row from the
  `UpdateUserProfileInput` patch. If the patch changes `firstName`/`lastName`,
  the **same transaction** updates `user.name` to the synced value (§5.4).
  Returns the updated `UserProfile`.

### 5.3 `ProfileController` (`@Controller('users')`)

| Method & path | Handler | Auth |
|---|---|---|
| `GET /api/users/me/profile` | `getOwn` | any authenticated user (own profile) |
| `PATCH /api/users/me/profile` | `updateOwn` | any authenticated user (own profile) |
| `GET /api/users/:id/profile` | `getByUserId` | sysadmin only |

The `me/profile` routes are self-by-construction — the caller id comes from
`@CurrentUser()`, so no per-instance authorization is needed beyond a valid
session. `GET /users/:id/profile` carries `@CheckAbility('manage', 'User')`,
the same sysadmin gate as the rest of the admin user surface. These routes do
not collide with `UsersController` (`/users/me`, `/users/:id`, …) — the paths
are distinct, and NestJS serves multiple controllers under the same prefix.

### 5.4 Name sync

First/Last name are the source of truth. On `updateOwn`, after computing the
new first/last values, `user.name` is set to `[firstName, lastName]` joined by
a space and trimmed. If both are empty/null the previous `user.name` is left
unchanged. The `user.name` write happens in the same transaction as the
`user_profile` upsert, so they commit together.

### 5.5 Authorization summary

- `GET`/`PATCH /users/me/profile` — any signed-in user, acting on their own row.
- `GET /users/:id/profile` — sysadmin only.
- No new CASL subject or rule is introduced; the existing sysadmin `manage all`
  rule covers the admin read, and the `me` endpoints are inherently self-scoped.

---

## 6. Frontend

FSD layout, matching the patterns in `apps/frontend/src/`.

### 6.1 New entity — `entities/profile/`

`api/profile.api.ts` — `getMyProfile()`, `updateMyProfile(input)`,
`getUserProfile(id)` (TanStack Query fetch wrappers around the three
endpoints). `model/profile.queries.ts` — query-options factories and an
`useUpdateMyProfile` mutation hook (composing `onSuccess` with cache
invalidation per the established spread-then-compose pattern; it also
invalidates the user list / `me` query so a synced `name` change is reflected).
Plus a barrel.

### 6.2 Self-service route + page

- `/profile` — a new TanStack Router route at
  `apps/frontend/src/app/router/routes/_app.profile.tsx`, under the
  authenticated `_app` layout (any signed-in user; no admin gate).
- `apps/frontend/src/pages/profile/` — the page slice; composes the profile
  form.

### 6.3 New feature — `features/profile-form/`

A form (not a dialog — a full page form) with:

- First name, Last name — text inputs.
- Date of birth, Taido start date — date inputs.
- Address — street, postal code, city (text inputs) + country (country picker).
- Citizenships — a country multi-picker: pick a country and add it; each added
  citizenship is listed with a remove control. Mirrors the add/remove pattern
  used by the membership editor.

On save it calls `updateMyProfile`; surfaces backend errors inline (the
established `FormMessage` pattern).

### 6.4 Sidebar entry

`widgets/appsidebar/` — add a **My profile** entry to the main nav group (the
`NAV` array, alongside Dashboard). Visible to every authenticated user; it is
**not** behind the admin-ability gate.

### 6.5 Admin read-only view

`features/user-form/` — `<UserForm>` gains a third tab, **Profile**, alongside
Details and Memberships. The Profile tab is **read-only**: it fetches the target
user's profile via `getUserProfile(id)` and renders the values (name, dates,
address, citizenships). It has no save action. Only sysadmins reach `<UserForm>`,
so no extra gating is needed.

### 6.6 Country picker

The `address_country` field and the citizenship multi-picker use a country
`Select`. They reuse the country list/options the organisation form already
uses for its `country` field; if that list is not cleanly reusable, a shared
country-list constant is added under `shared/`.

### 6.7 i18n

New keys in `en.json`, `sv.json`, `fi.json` for the profile page, the form
field labels, the sidebar entry, and the admin Profile tab.

---

## 7. Testing strategy

- **Contract Zod tests** — `UserProfileSchema` / `UpdateUserProfileSchema`
  accept valid shapes and reject malformed dates, over-long strings, etc.
- **`ProfileService` unit tests** (Drizzle stubbed) — `getOwn` returns the
  empty-profile shape when no row exists; `updateOwn` upserts and syncs
  `user.name` from First/Last in one transaction; `getByUserId` 404s an unknown
  user.
- **Backend authorization** — `GET /users/:id/profile` is rejected for a
  non-sysadmin caller.
- **Frontend component tests** — the profile form renders and submits a patch;
  the citizenship multi-picker adds/removes; the admin Profile tab renders a
  fetched profile read-only.
- Existing suites stay green throughout.

---

## 8. Deliberate scope decisions (recap)

- All profile fields are optional.
- Citizenships are a `text[]` column, not a normalized join table.
- Self-profile edits are not written to the audit log.
- Sysadmins can view (read-only), not edit, other users' profiles.
- First/Last name are the source of truth; `user.name` is the synced,
  denormalized display name. The admin user-form's `name` field is left as-is.
