# User Management Design

**Status:** target spec — not yet implemented. The shipping app today only exposes `GET /users`, `GET /users/me`, `GET /users/:id` and a single-tier `admin` / `user` role check. This spec replaces that with a four-role permission model (`sysadmin` / `user` global, `orgadmin` / `instructor` org-scoped), a membership table for the org-scoped roles, and a sysadmin-facing UI for the full user lifecycle.

**Date:** 2026-05-18

**Author:** Stefan (with Claude)

**Phasing:** delivered in three independently reviewable phases (Phase 1 → 2 → 3). Each phase ships its own implementation plan and merges as its own PR.

---

## 1. Goals

A user with the `sysadmin` global role can:

1. **See every user** in the system — searchable, filterable, paginated.
2. **Assign roles** to other users, both the global role (`sysadmin` ↔ `user`) and any number of org-scoped role memberships (`orgadmin` of org X, `instructor` of club Y).
3. **Invite new users** by email; the invitee sets their own password via a one-time link without the sysadmin ever seeing the credential.
4. **Disable or remove accounts** — soft-deactivate (recoverable) by default; hard-delete as a separate, confirmed action.
5. **Trigger a password reset** for a user when needed; the email reaches the user with a one-time link.

Every mutation is recorded in the existing audit log with `entityType` `user` or `organisation_membership`.

The shipping app's existing CASL gate (`ability.can('manage', 'Organisation')`) keeps working — the legacy `admin` role is migrated to `sysadmin` in the data layer and behaviour stays equivalent for the seed account.

---

## 2. Non-goals (v1)

These are explicitly out of scope for the first delivery — captured here so they don't creep in:

- **Org-tree inheritance.** An `orgadmin` of NF-Sweden does **not** automatically get rights over its clubs. Memberships are flat and explicit: to manage three clubs under one federation, you bind three `orgadmin` memberships. Reconsider in v2 if operator overhead bites.
- **Forced session revocation on deactivation.** Existing sessions for a deactivated user live until they expire naturally. The `AuthGuard` blocks fresh sign-ins; that's the v1 line.
- **A real outbound-email provider.** v1 ships `ConsoleEmailService` that logs the rendered email to backend stdout. Plugging in Resend/SMTP/Postmark is a single new class behind the same interface in a follow-up.
- **A "user activity" tab inside `<UserForm>`.** The audit-log widget already supports a `userId` filter; wiring the tab in is trivial but deferred so Phase 3 stays tight.
- **Bulk operations** (multi-select deactivate, multi-select role change, multi-row CSV import).
- **An "active members" panel on the organisation form** showing who's an orgadmin/instructor for that org. The inverse view of memberships — interesting but not required.
- **Stronger password policy** than better-auth's default (`min 8`). Revisit when a real security review happens.

---

## 3. Role taxonomy

Five roles split between two scopes:

| Role | Scope | Notes |
|---|---|---|
| `sysadmin` | global | full system control; the only role allowed to manage users + memberships |
| `user` | global, default | regular authenticated account |
| `orgadmin` | org-scoped (any org type) | manages one specific organisation; the org's `type` field tells you whether it's effectively a federation or club admin |
| `instructor` | org-scoped (clubs only) | read access to their club |

Global role (`sysadmin` / `user`) lives in `user.role`. Org-scoped roles (`orgadmin` / `instructor`) live in a new `organisation_membership` table — a user can hold any number of org-scoped memberships, including across different orgs.

### CASL rule grid

| Role | Subject | Action | Condition |
|---|---|---|---|
| `sysadmin` | `all` | `manage` | — |
| `user` | `User` | `read` | `{ id: self.id }` |
| `orgadmin` (per membership) | `Organisation` | `manage` | `{ id: membership.organisationId }` |
| `orgadmin` (per membership) | `AuditLog` | `read` | `{ entityType: 'organisation', entityId: membership.organisationId }` |
| `instructor` (per membership) | `Organisation` | `read` | `{ id: membership.organisationId }` |

`User` and `OrganisationMembership` are sysadmin-only — org-scoped admins can manage their org but **cannot** grant roles or manage users. That keeps the "who can grant roles" surface deliberately tight.

### Self-protection invariants

Enforced server-side, surfaced in the UI as 409 errors with `code: 'SELF_PROTECTED'` (variants below) and friendly i18n messages:

- `SELF_DEMOTE` — cannot demote yourself.
- `SELF_DEACTIVATE` — cannot deactivate yourself.
- `SELF_DELETE` — cannot delete yourself.
- `LAST_SYSADMIN` — cannot demote, deactivate, or delete the last user whose role is `sysadmin` and `deactivated_at IS NULL`. The check is `SELECT count(*) FROM user WHERE role = 'sysadmin' AND deactivated_at IS NULL` inside the same transaction as the mutation — race-safe under `READ COMMITTED` since the transaction holds the row lock.

---

## 4. Data model

### 4.1 `user` table changes

The better-auth-managed `user` table gains two columns and tightens one:

| Column | Type | Notes |
|---|---|---|
| `role` | `text NOT NULL DEFAULT 'user'` | existing column; tighten via CHECK constraint `role IN ('sysadmin', 'user')`. Better-auth's Drizzle adapter requires this column to stay `text`, so a CHECK is used rather than a Postgres `ENUM` type. |
| `deactivated_at` | `timestamptz NULL` | new. `NOT NULL` ⇒ user cannot sign in; rendered with a "Deactivated" badge in the admin UI. |

No data migration is required for `role` — the seed `admin` value is migrated to `sysadmin` in the same migration that adds the CHECK constraint (otherwise the CHECK would reject existing rows). All other existing values are `user` (the default).

### 4.2 New table: `organisation_membership`

```
id               uuid primary key default gen_random_uuid()
user_id          text not null references user(id) on delete cascade
organisation_id  uuid not null references organisations(id) on delete cascade
role             membership_role not null     -- pgEnum
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()

unique (user_id, organisation_id, role)
index on (user_id)
index on (organisation_id)
```

`membership_role` is a Postgres `pgEnum` with values `('orgadmin', 'instructor')`. The pgEnum is created in the same migration. Drizzle exposes it as a first-class column type with TS-narrowed `row.role`.

**App-level invariant** (service code, not DB): `role = 'instructor'` requires `organisations.type = 'club'`. `role = 'orgadmin'` is unconstrained on org type. Enforced in `MembershipsService.create` and `.update`; matches the way the org-hierarchy ladder rules are validated today.

**Update semantics:** changing a membership's role is a true `PATCH /memberships/:id` that preserves `id` and `created_at`. The audit-log entry is an `update` with `before.role` and `after.role`, not a delete-then-create pair.

### 4.3 Validation layering

Both `user.role` and `organisation_membership.role` are validated at two layers:

| Layer | `user.role` | `organisation_membership.role` |
|---|---|---|
| Application (Zod enum in `@repo/contracts`) | `z.enum(['sysadmin', 'user'])` | `z.enum(['orgadmin', 'instructor'])` |
| Database | `CHECK (role IN ('sysadmin', 'user'))` | `pgEnum('membership_role', ['orgadmin', 'instructor'])` |

A small integration test introspects both layers and asserts the value-set agrees. Adding a role requires updating both layers, and the test catches forgetfulness.

---

## 5. Contracts package (`@repo/contracts`)

### 5.1 `users.ts`

Add to `UserSchema`:

```ts
role: z.enum(['sysadmin', 'user']),
deactivatedAt: z.string().datetime().nullable(),
```

Add `RoleSchema = z.enum(['sysadmin', 'user']).meta({ id: 'Role' })` as a standalone exported schema for reuse in inputs.

New schemas:

```ts
ListUsersQuerySchema = z.object({
  q: z.string().optional(),
  role: RoleSchema.optional(),
  deactivated: z.enum(['true', 'false', 'all']).default('false'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

ListUsersResponseSchema = z.object({
  data: UserSchema.array(),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  perPage: z.number().int().min(1),
});

UpdateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: RoleSchema.optional(),
});

InviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
});

SetInitialPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});
```

### 5.2 New file: `memberships.ts`

```ts
MembershipRoleSchema = z.enum(['orgadmin', 'instructor']).meta({ id: 'MembershipRole' });

OrganisationMembershipSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  organisationId: z.string().uuid(),
  role: MembershipRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

CreateMembershipSchema = z.object({
  userId: z.string(),
  organisationId: z.string().uuid(),
  role: MembershipRoleSchema,
});

UpdateMembershipSchema = z.object({
  role: MembershipRoleSchema,
});

ListMembershipsQuerySchema = z.object({
  userId: z.string().optional(),
  organisationId: z.string().uuid().optional(),
});

ListMembershipsResponseSchema = z.object({
  data: OrganisationMembershipSchema.array(),
  total: z.number().int().nonnegative(),
});
```

Exported via the new subpath export `@repo/contracts/memberships`.

### 5.3 `casl.ts`

Extend `SubjectSchema` and the discriminated subject union:

```ts
SubjectSchema = z.enum(['User', 'Organisation', 'AuditLog', 'OrganisationMembership', 'all']);

OrganisationMembershipSubjectShape = {
  readonly __caslSubjectType__: 'OrganisationMembership';
  id?: string;
  userId?: string;
  organisationId?: string;
  role?: 'orgadmin' | 'instructor';
};
```

`AppSubject` widens to include the new shape.

### 5.4 `audit-log.ts`

Extend the `EntityType` enum to include `'user'` and `'organisation_membership'`.

Extend the `AuditAction` enum to include `'deactivate'`, `'reactivate'`, and `'password_reset_triggered'`.

---

## 6. Backend module changes

### 6.1 `apps/backend/src/modules/users/`

**`UsersRepository`** gains:

- `list({ q, role, deactivated, page, perPage })` — returns `{ rows, total }`. Filters via `ILIKE` on `email`/`name` when `q` is set; filters on `role`; filters on `deactivated_at IS NULL` / `IS NOT NULL` / no filter based on the `deactivated` arg.
- `update(id, { name?, role? })` — partial update, returns the new row.
- `deactivate(id)` / `reactivate(id)` — toggles `deactivated_at`.
- `delete(id)` — hard delete; cascades via FK.
- `countActiveSysadmins()` — single-row count used by the self-protection guard.

**`UsersService`** gains: `list`, `update`, `invite`, `deactivate`, `reactivate`, `delete`, `sendPasswordReset`, `setInitialPassword`. Every write method:

- Checks CASL ability (`@CheckAbility('manage', 'User')` or `('update', 'User', subject)`).
- Validates self-protection invariants.
- Wraps the mutation + audit-log emission in `db.transaction`.

**`UsersController`** gains: `GET /users` (paginated), `PATCH /users/:id`, `POST /users/invite`, `PATCH /users/:id/deactivate`, `PATCH /users/:id/reactivate`, `DELETE /users/:id`, `POST /users/:id/send-password-reset`. Plus a public auth endpoint `POST /auth/set-initial-password` (mounted under the `auth` module, not `users`).

**`UsersAbilityRules`** is rewritten:

- `sysadmin`: `builder.can('manage', 'all')` — full grant.
- Anyone else with a `user_id` matching an `orgadmin` membership: `builder.can('manage', 'Organisation', { id: membership.orgId })` for each membership.
- Anyone with an `instructor` membership: `builder.can('read', 'Organisation', { id: membership.orgId })`.
- Everyone else (including `role = 'user'` with no memberships): `builder.can('read', 'User', { id: self.id })`.

Memberships are loaded fresh per-request inside `AbilityFactory.createForUser(user)` — same lifecycle as today's ability resolution. The `AuthenticatedUser` shape gains an optional `memberships: { organisationId: string; role: 'orgadmin' | 'instructor' }[]` field, hydrated by the auth layer before the guard fires. A future caching layer can memoise the lookup per-session if profiling shows it's needed; v1 just queries the table on every request.

### 6.2 New module: `apps/backend/src/modules/memberships/`

Mirrors the organisations module shape: `memberships.controller.ts`, `memberships.service.ts`, `memberships.repository.ts`, `memberships.abilities.ts`, `memberships.module.ts`, `dto/`, `*.spec.ts`.

- `GET /memberships?userId=&organisationId=` — sysadmin sees all; non-sysadmin can only filter by their own `userId`.
- `POST /memberships` — sysadmin-only. Body: `CreateMembershipInput`. Service validates the `instructor → club` invariant.
- `PATCH /memberships/:id` — sysadmin-only. Body: `UpdateMembershipInput` (`{ role }`). Re-validates the invariant against the *unchanged* `organisationId`.
- `DELETE /memberships/:id` — sysadmin-only.

All mutations transact with audit-log emission. `entityType: 'organisation_membership'`, action `create` / `update` / `delete`, with `before` / `after` snapshots.

### 6.3 New module: `apps/backend/src/infrastructure/email/`

```
EmailService (interface)
  sendInvite({ to, locale, setPasswordUrl, inviterName }): Promise<void>
  sendPasswordReset({ to, locale, resetUrl }): Promise<void>             // self-triggered
  sendAdminPasswordReset({ to, locale, resetUrl, adminName }): Promise<void>

ConsoleEmailService implements EmailService — v1 default
```

Provided in the Nest DI graph under `EMAIL_SERVICE` (Symbol). All three methods accept `locale` so templates render in the recipient's preferred language; fallback to `en` if not supplied or missing.

Templates live as plain TS render functions in `apps/backend/src/infrastructure/email/templates/` — one file per template per locale, e.g. `invite.en.ts`. The shape is `(args) => { subject: string; body: string }`. No HTML in v1 — plain text only. A future provider plug-in can add HTML rendering without touching the service interface.

### 6.4 Better-auth integration

In `apps/backend/src/infrastructure/auth/better-auth.ts`:

```ts
emailAndPassword: {
  enabled: true,
  autoSignIn: true,
  sendResetPassword: async ({ user, url }) => {
    // user-initiated reset only — admin-initiated bypasses this callback
    await emailService.sendPasswordReset({
      to: user.email,
      locale: user.locale,
      resetUrl: url,
    });
  },
}
```

`AuthGuard` ([`auth.guard.ts`](apps/backend/src/infrastructure/auth/auth.guard.ts)) gains a `if (user.deactivatedAt !== null) throw Unauthorized` check after session resolution. Existing sessions for a now-deactivated user still resolve to a session, but the guard rejects the request — effectively "your session lives but you can't act."

### 6.5 Invitation flow (custom, bypasses better-auth signup)

1. `POST /users/invite` — sysadmin-only.
2. `UsersService.invite({ email, name })`:
   - Looks up an existing `user` by email.
     - If active → 409 `EMAIL_IN_USE`.
     - If deactivated → 409 `EMAIL_DEACTIVATED` (UI surfaces "reactivate this user instead").
     - If exists with an unconsumed invite token → re-send email with the existing token (no duplicate user row).
   - Otherwise:
     - Inserts a `user` row with `role = 'user'`, `emailVerified = false`, no password set (the `account.password` column stays `NULL`).
     - Inserts a `verification` row with `identifier = 'invite:<userId>'`, value = random 32-byte hex, `expires_at = now() + INVITE_TOKEN_TTL_HOURS`.
     - Calls `EmailService.sendInvite({ to, locale: 'en', setPasswordUrl: ${WEB_ORIGIN}/set-password?token=<value>, inviterName })`.
     - Emits an audit-log `create` event for the user.
3. Returns the created `User` (status 201).

### 6.6 Admin-triggered password reset (custom, bypasses `sendResetPassword` callback)

1. `POST /users/:id/send-password-reset` — sysadmin-only.
2. `UsersService.sendPasswordReset({ userId, adminUser })`:
   - Inserts a `verification` row with `identifier = 'admin-reset:<userId>'`, value = random 32-byte hex, `expires_at = now() + RESET_TOKEN_TTL_HOURS`.
   - Calls `EmailService.sendAdminPasswordReset({ to, locale, resetUrl: ${WEB_ORIGIN}/set-password?token=<value>, adminName: adminUser.name })`.
   - Emits an audit-log `password_reset_triggered` event with `triggeredBy: adminUser.id` in the `after` payload.

The `/set-password` page handles both `invite:*` and `admin-reset:*` tokens transparently — it submits to `POST /auth/set-initial-password`, which dispatches on the `identifier` prefix.

### 6.7 `POST /auth/set-initial-password` (public endpoint)

1. Body: `{ token, password }`.
2. Look up the matching `verification` row.
3. Reject if not found or `expires_at < now()`.
4. Resolve the `userId` from the identifier (`invite:<id>` or `admin-reset:<id>`).
5. Hash the password via better-auth's exposed helper, insert/update the `account` row (`providerId: 'credential'`, `password: <hash>`).
6. Set `user.emailVerified = true` (the email-link click implicitly verifies the address — column name follows better-auth's camelCase).
7. Delete the consumed verification row.
8. Sign the user in via better-auth's session-issue API; return the session cookie.

### 6.8 `env.schema.ts` additions

```ts
INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(48),
RESET_TOKEN_TTL_HOURS:  z.coerce.number().int().min(1).default(1),
```

Both already covered by the existing `EnvSchema` pattern.

---

## 7. Frontend

FSD layout, matching the patterns already in [`apps/frontend/src/`](apps/frontend/src/).

### 7.1 New route

`/admin/users` — TanStack Router route at `apps/frontend/src/app/router/routes/_app.admin.users.tsx`. Gated on `ability.can('manage', 'User')` (the route's `beforeLoad` redirects to `/dashboard` otherwise).

`/set-password` — public route at `apps/frontend/src/app/router/routes/_public.set-password.tsx`. Accepts `?token=<value>` query parameter.

### 7.2 New page slice

`apps/frontend/src/pages/admin-users/` — composes `<UsersFilters>`, `<UsersTable>`, `<InviteUserDialog>`, `<UserForm>` (in edit mode), and `<UserDeleteDialog>`. Page-level state machine for which dialog is open, mirroring the pattern in [`pages/admin-organisations/`](apps/frontend/src/pages/admin-organisations/).

`apps/frontend/src/pages/set-password/` — single-route page; renders the `<SetPasswordForm>` feature.

### 7.3 New widgets

- `apps/frontend/src/widgets/users-table/` — paginated table. Columns: email, name, role badge, membership count, deactivated badge, last-activity (if cheap). Click row → opens edit dialog. MD3-tokenised throughout per [feedback_token-boundary](memory).
- `apps/frontend/src/widgets/users-filters/` — search input, role select, "show deactivated" toggle (default off). Same shape as `audit-log-filters`.

### 7.4 New features

- `apps/frontend/src/features/user-form/` — Dialog-based, two tabs (Details, Memberships) matching `<OrganisationForm>` patterns. Details: email (read-only), name, role select (sysadmin-only, disabled when editing self), lifecycle actions (Phase 3). Memberships: list + per-row `[Edit role]` / `[Remove]`; "Add membership" opens the `<MembershipEditor>` sub-dialog.
- `apps/frontend/src/features/membership-editor/` — Dialog-based. Org picker (searchable, flat list from `listOrganisations`) + role select. Instructor option disables when the picked org is not a club, with an inline hint.
- `apps/frontend/src/features/invite-user-dialog/` — Dialog with email + optional name. Submits to `POST /users/invite`. Closes on success, table refetches.
- `apps/frontend/src/features/user-delete-dialog/` — Typed-email confirmation, matching the `OrganisationDeleteDialog` pattern.
- `apps/frontend/src/features/set-password-form/` — Public form: password + confirm, submits to `POST /auth/set-initial-password`. Handles expired / invalid token error states with friendly copy.

### 7.5 New entities

`apps/frontend/src/entities/membership/` — `api/membership.api.ts` (TanStack Query wrappers around the new endpoints) + `model/membership.queries.ts` + barrel.

`apps/frontend/src/entities/user/` already exists implicitly via `useSession()` — extend with `api/user.api.ts` and `model/user.queries.ts` for the admin operations (`listUsers`, `updateUser`, `inviteUser`, `deactivateUser`, `reactivateUser`, `deleteUser`, `sendPasswordReset`). Mutation hooks compose `onSuccess` with query invalidation, following the spread-then-compose pattern already established in [`organisation.queries.ts`](apps/frontend/src/entities/organisation/model/organisation.queries.ts).

### 7.6 AppSidebar update

[`widgets/appsidebar/`](apps/frontend/src/widgets/appsidebar/) admin group adds a `Users` entry:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild isActive={pathname.startsWith('/admin/users')}>
    <Link to="/admin/users">
      <Users />
      <span>{t('nav.adminUsers')}</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Gated on the same `ability.can('manage', 'Organisation')` check that exposes the admin group at all, plus a finer `ability.can('manage', 'User')` gate on this specific entry — only sysadmins see it.

### 7.7 i18n

New keys land in `en.json`, `sv.json`, `fi.json`:

- `nav.adminUsers`
- `admin.users.title`, `.inviteUser`, `.fields.*`, `.actions.*`, `.roles.{sysadmin,user,orgadmin,instructor}`, `.confirm.{delete,deactivate,passwordReset}`, `.errors.{emailInUse,emailDeactivated,selfDemote,selfDeactivate,selfDelete,lastSysadmin,instructorRequiresClub}`, `.lifecycle.{deactivate,reactivate,delete,sendPasswordReset}`
- `setPassword.{title,description,submit,success,expired,invalid}`

Email templates live in code, not JSON — one file per template per locale.

---

## 8. Phasing

### Phase 1 — Roles + memberships data layer

Ships the data model and CASL rewrite. **No UI changes.** Every existing endpoint starts honouring memberships and the tightened role enum.

**Deliverables:**

- Contracts: `RoleSchema` on `UserSchema`, `deactivatedAt` on `UserSchema`, new `memberships.ts`, `OrganisationMembership` subject added to `casl.ts`, audit-log entity/action enums widened.
- Drizzle: migration `0008_*.sql` — adds `deactivated_at`, adds CHECK on `user.role`, migrates seed `admin` → `sysadmin`, creates `membership_role` pgEnum, creates `organisation_membership` table.
- Backend: `MembershipsRepository`, `MembershipsService` (with `instructor → club` invariant + audit-log emission), `MembershipsController`, `MembershipsModule`. Rewrite of `UsersAbilityRules` and `OrganisationsAbilityRules` to read memberships. `AuthGuard` rejects deactivated users. `AbilityFactory` extended to hydrate memberships into `AuthenticatedUser`.
- Seed: `seed-sysadmin.ts` sets `role = 'sysadmin'` explicitly. Example memberships added to `seed.ts` for development.
- Tests: contract Zod tests; `MembershipsService` unit tests (invariant rejection, uniqueness, audit-log emission); CASL ability tests covering the role × subject × action grid; integration test asserting the Zod enum and DB CHECK/pgEnum agree.

**Done when:** all tests pass; the seeded sysadmin user can do everything they could before; a non-sysadmin user with an `orgadmin` membership of NF-Sweden can `PATCH /organisations/<NF-Sweden id>` but cannot `PATCH` any other org or `GET /users`; sign-in is rejected for any user with `deactivated_at IS NOT NULL`.

### Phase 2 — Read + role management UI

Ships the `/admin/users` page and role editing. **No invite, deactivate, delete, or password reset yet.**

**Deliverables:**

- Backend: `GET /users` extended with `q`/`role`/`deactivated`/`page`/`perPage`; `PATCH /users/:id` for `name` + `role` (with the last-sysadmin guard). The `MembershipsController` endpoints already exist as of Phase 1 — Phase 2 just adds the frontend consumers.
- Frontend: `/admin/users` route, page slice, `<UsersTable>`, `<UsersFilters>`, `<UserForm>` (Details + Memberships tabs), `<MembershipEditor>`. Sidebar adds the `Users` entry.
- i18n: keys for everything visible in Phase 2.
- Tests: backend service specs for `list` and `update` with self-protection cases; frontend component tests for `<UsersTable>`, `<UserForm>` (sysadmin-only role select, disable-when-self), `<MembershipEditor>` (instructor-disabled-on-non-club).

**Done when:** sysadmin can sign in, navigate to `/admin/users`, search, open a user, change their global role (where allowed), add a membership, edit a membership's role, remove a membership. Every change appears in `/admin/audit-log`.

### Phase 3 — Lifecycle (invite / deactivate / delete / password reset)

Ships the email abstraction and the four lifecycle actions.

**Deliverables:**

- Backend: `EmailService` interface + `ConsoleEmailService`; `POST /users/invite`, `PATCH /users/:id/deactivate`, `PATCH /users/:id/reactivate`, `DELETE /users/:id`, `POST /users/:id/send-password-reset`, `POST /auth/set-initial-password`. Better-auth `sendResetPassword` callback wired. `env.schema.ts` additions for TTL config.
- Frontend: `<InviteUserDialog>`, `<UserDeleteDialog>`, lifecycle action row in `<UserForm>` Details tab, `/set-password` route + `<SetPasswordForm>`.
- i18n: keys for lifecycle actions, invite dialog, set-password page; email templates per locale.
- Tests: backend service specs for each lifecycle method with full self-protection grid; invitation flow integration test ("invite → captured stdout URL → set password → can sign in"); frontend tests for `<InviteUserDialog>`, `<UserDeleteDialog>` (typed-email gate), lifecycle buttons hidden when self.

**Done when:** a sysadmin can invite a brand-new user by email, the invite link logged to backend stdout works, the new user lands on `/set-password`, sets a password, is signed in, and lands on `/dashboard`. The sysadmin can deactivate, reactivate, and delete users (with all self-protection invariants enforced), and trigger a password reset that produces a working link in the backend log.

---

## 9. Testing strategy summary

- **Vitest unit (Drizzle stubbed)** — every service method gets allow/deny pairs across the role × subject × action grid; self-protection invariants get explicit "rejects last-sysadmin demotion" tests; CASL rules tested via the existing `AbilityFactory` pattern.
- **Vitest integration** — invitation flow end-to-end with the real `ConsoleEmailService` (captures stdout); admin-triggered reset flow same.
- **Vitest + Testing Library (frontend)** — one tight test per dialog/widget focused on user-visible behaviour. No implementation-detail assertions.
- **CASL value-set integration test** — introspects both the Zod enum and the DB CHECK/pgEnum at boot time and asserts agreement.
- **Existing test suites stay green throughout** — organisations, audit-log, login. The legacy seed sysadmin retains every permission they had before.

---

## 10. Open follow-ups deferred to v2+

Captured in §2 but repeated here so the spec carries the deferred list:

- Org-tree inheritance for org-scoped roles.
- Forced session revocation when a user is deactivated.
- Real email provider plug-in for `EmailService` (Resend / SMTP / Postmark).
- "Audit log for this user" tab on the user form (the audit-log filter already supports it).
- Bulk operations (multi-select deactivate, multi-select role change, CSV import).
- An "active members" panel on the organisation form showing who's an orgadmin/instructor for that org.
- Stronger password policy than better-auth's default `min 8`.
- Two-factor authentication.

---

## 11. Implementation order

The implementation plans live in `docs/superpowers/plans/` and are written one phase at a time — Phase 1 first, then Phase 2 once Phase 1 is merged, then Phase 3. Each plan owns its own task breakdown, branch, and PR. The spec above is the source of truth all three plans build against.
