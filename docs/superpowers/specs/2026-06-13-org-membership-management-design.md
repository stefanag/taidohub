# Org membership management — Design

> Sysadmin can manage all org memberships from the existing admin pages;
> orgadmin can manage `instructor` memberships in their own org(s) via a new
> `/my-organisation` page. Both surfaces mount the same
> `<MembershipManager>` primitive.

**Status:** approved 2026-06-13 (brainstorming)
**Owner:** stefanag
**Phase 3.5 baseline:** `ab64833` (belt_systems global-only)
**Predecessor work:** Phase 3.5 introduced `Student` CASL subject + `useMyMembershipsQuery` — both reused here.

---

## 1. Problem

Today the [memberships module](../../../apps/backend/src/modules/memberships/memberships.controller.ts) is fully wired on the backend (CRUD + audit) but only callable by sysadmins, and **no admin UI surfaces it**. There is no way for either a sysadmin or an orgadmin to add, remove, or change memberships from the app. Sysadmins must hit the API directly; orgadmins have no path at all to give someone `instructor` access in their own org.

## 2. Goal

- **Sysadmin:** manage memberships across all users and orgs from `/admin/users` (user-scoped drawer) and `/admin/organisations` (org-scoped drawer).
- **Orgadmin:** manage `instructor` memberships in their own org from a new `/my-organisation` page.
- **Everyone else:** unchanged — they only see their own memberships (already carried on the session).

## 3. Out of scope (deferred)

- Inviting users who don't yet exist (the user must already be in the `user` table; sysadmin creates users via existing flows)
- Bulk operations (one membership at a time)
- A standalone audit-log viewer inside the manager (the existing `/admin/audit-log` page suffices)
- Orgadmin role-change (orgadmins can only add + remove, not `PATCH`)

## 4. Authorization model

The `OrganisationMembership` CASL subject's instance shape is `{ organisationId, role }`. The rule contributor grants the following by actor type:

| Actor | `read` | `create` / `delete` | `update` |
|---|---|---|---|
| sysadmin | any | any | any |
| orgadmin in org `X` | `{organisationId: X}` (sees all members of X, all roles) | `{organisationId: X, role: 'instructor'}` (instructor rows only) | none |
| anyone else | their own row only (existing behaviour, via the `User` subject's session payload) | none | none |

**Why no orgadmin `update`.** With multi-role allowed, "change instructor → orgadmin" would let an orgadmin escalate a peer (or themselves) inside their own org. Eliminating `update` for orgadmin keeps the rule one-line trivial: orgadmin never touches an `orgadmin` row, period. Orgadmins who need a role swap delete + create.

**Self-protection** (service-layer, not CASL): an orgadmin cannot delete their own `orgadmin` row in any org — prevents accidental lockout. Sysadmin can do this (with a confirm dialog). CASL doesn't enforce this because the CASL condition can't reference `actor.id`.

**Last-orgadmin guard** (service-layer, sysadmin only): when deleting an `orgadmin` row, if it was the org's last `orgadmin` membership, return a 409-style soft block with a code the frontend can detect and show as a confirm-to-proceed. Orgadmins can't trigger this case (CASL blocks them from deleting orgadmin rows at all).

## 5. Backend changes

### 5.1 CASL widening — `apps/backend/src/modules/memberships/memberships.abilities.ts`

```ts
contributeTo(builder, user) {
  if (!user) return;
  if (user.role === 'sysadmin') {
    builder.can('manage', 'OrganisationMembership');
    return;
  }
  const orgs = user.memberships
    .filter((m) => m.role === 'orgadmin')
    .map((m) => m.organisationId);
  if (orgs.length === 0) return;

  builder.can('read', 'OrganisationMembership', { organisationId: { $in: orgs } });
  builder.can('create', 'OrganisationMembership', {
    organisationId: { $in: orgs },
    role: 'instructor',
  });
  builder.can('delete', 'OrganisationMembership', {
    organisationId: { $in: orgs },
    role: 'instructor',
  });
  // No 'update' — intentional.
}
```

Pattern matches Phase 3.5's `StudentAbilityRules` exactly (same `$in` overlap; same `never` cast for the TS gap on the `organisationId` array-field condition).

### 5.2 `MembershipsService.list` scope widening

Today: non-sysadmins can only filter by their own `userId`. New behaviour: non-sysadmins can also filter by an `organisationId` they're an `orgadmin` of.

```ts
async list(query, actor) {
  if (actor.role === 'sysadmin') return this.repo.list(query);

  const orgAdminOrgs = actor.memberships
    .filter((m) => m.role === 'orgadmin')
    .map((m) => m.organisationId);

  if (query.userId === actor.id) return this.repo.list(query);
  if (query.organisationId && orgAdminOrgs.includes(query.organisationId)) {
    return this.repo.list(query);
  }
  throw new ForbiddenException({
    error: { code: 'FORBIDDEN', message: 'Cannot list memberships outside your own scope.' },
  });
}
```

The controller is untouched. Existing self-only path stays.

### 5.3 `MembershipsService.delete` guards

Before the existing delete call, add:

```ts
// Self-demote: orgadmin can't remove their own orgadmin row.
if (
  existing.role === 'orgadmin' &&
  existing.userId === actor.id &&
  actor.role !== 'sysadmin'
) {
  throw new ForbiddenException({
    error: {
      code: 'SELF_DEMOTE_BLOCKED',
      message: 'Orgadmins cannot remove their own orgadmin role.',
    },
  });
}

// Last-orgadmin: only sysadmin can reach this. Soft block — service throws a
// distinct conflict code so the frontend can re-issue with `?confirm=true`.
if (existing.role === 'orgadmin' && actor.role === 'sysadmin') {
  const count = await this.repo.countOrgadminsForOrg(existing.organisationId);
  if (count === 1 && !confirm) {
    throw new ConflictException({
      error: {
        code: 'LAST_ORGADMIN',
        message: 'This is the last orgadmin in the organisation.',
      },
    });
  }
}
```

The `confirm` flag is a new optional **query string** on `DELETE /api/memberships/:id?confirm=true`. The controller passes it as a second positional arg into `service.delete(id, actor, { confirm: query.confirm === true })`. Sysadmin frontend reissues with the flag after the confirm dialog. (Single addition to `DELETE`; no other endpoint sees it.)

### 5.4 No other backend changes

- `POST /api/memberships` — existing `@CheckAbility('create', 'OrganisationMembership')` already evaluates the new conditions correctly.
- `PATCH /api/memberships/:id` — likewise (sysadmin-only by CASL once §5.1 lands).
- Audit log — `MembershipsService` already emits `audit.record({...})` on every mutation; nothing changes.
- OpenAPI regenerated as part of §6 (the `?confirm` query string is a single additive change to the existing `DELETE` DTO).
- No schema/migration changes.

## 6. Contract changes

- `packages/contracts/src/memberships.ts`: add `confirm?: boolean` to `DeleteMembershipQuerySchema` (or equivalent). Tiny, additive.
- No new schemas. The existing `OrganisationMembershipSchema`, `CreateMembershipSchema`, `UpdateMembershipSchema` cover the wire.
- Regenerate OpenAPI once after this lands.

## 7. Frontend

### 7.1 `entities/membership` (new slice)

Mirror `entities/student` (Phase 3.5 commit `dc37218`).

```
apps/frontend/src/entities/membership/
├── api/membership.api.ts         # getMemberships(filter), create, update, delete (with confirm)
├── api/membership.api.test.ts
├── lib/hooks.ts                  # useMembershipsQuery(filter), mutation hooks
└── index.ts
```

`useMembershipsQuery({ userId? | organisationId? })` is keyed by both filters. Mutations invalidate `['membership']` AND `['me','memberships']` so the sidebar gating refetches when the caller's own memberships change.

### 7.2 `features/membership-manager` (new — the shared primitive)

```
apps/frontend/src/features/membership-manager/
├── ui/MembershipManager.tsx
├── ui/MembershipManager.test.tsx
├── ui/AddMembershipDialog.tsx
├── ui/AddMembershipDialog.test.tsx
└── index.ts
```

**Contract:**

```ts
interface MembershipManagerProps {
  scope:
    | { kind: 'user'; userId: string; userLabel: string }
    | { kind: 'org';  organisationId: string; orgLabel: string };
}
```

**Behaviour:**

- One row per membership (a multi-role user appears once per role; confirmed in design).
- Reads `useAbility()` to gate the per-row **Remove** button and the top-level **+ Add** button.
- Hides **Remove** preemptively on the caller's own `orgadmin` rows.
- **+ Add** opens `<AddMembershipDialog>`. Fields depend on scope:
  - User-scope → org picker (Combobox over `useOrganisationsQuery()`) + role picker.
  - Org-scope → user picker (Combobox over `useUsersQuery({ search })`, server-side, 300ms debounce) + role picker.
- The role picker shows only roles the actor can grant in the picked org: orgadmin sees `instructor` only; sysadmin sees both.
- On 409 `LAST_ORGADMIN`, the manager shows a confirm modal and re-issues `delete` with `confirm=true`.

**Hooks to verify during plan-writing** (existence assumed by this design — confirm before authoring tasks):

- `useOrganisationsQuery()` — for the user-scope org picker
- `useUsersQuery({ search })` — for the org-scope user picker (server-side search; debounce 300ms)
- The existing global-role editor inside `AdminUsersPage` (if it's a row-action dialog today, the drawer integration absorbs it; if it's inline, the drawer wraps it)

If any are missing, the plan-writing skill adds tasks to introduce them.

### 7.3 Integration into existing admin pages

- **`/admin/users`**: clicking a row opens a `<Sheet>` drawer with the user's basic info + global-role editor (existing) + `<MembershipManager scope={{ kind: 'user', userId, userLabel }}>`.
- **`/admin/organisations`**: clicking a row opens a `<Sheet>` drawer with org details + `<MembershipManager scope={{ kind: 'org', organisationId, orgLabel }}>`.

### 7.4 New page — `/my-organisation`

```
apps/frontend/src/pages/my-organisation/
├── ui/MyOrganisationPage.tsx
├── ui/MyOrganisationPage.test.tsx
└── index.ts
+ apps/frontend/src/app/router/routes/_app.my-organisation.tsx
```

- Reads `useMyMembershipsQuery()`.
- Filters to memberships where caller's role is `orgadmin` → derives the list of orgs the user can manage.
- One org → mount `<MembershipManager scope={{ kind: 'org', organisationId, orgLabel }}>` directly.
- Multiple orgs → render a tab strip (one tab per managed org); the active tab mounts the manager.
- Zero (defensive — sidebar gating already prevents nav here) → friendly empty state.

### 7.5 Sidebar — `widgets/appsidebar/ui/AppSidebar.tsx`

```tsx
const isOrgAdmin = memberships.some((m) => m.role === 'orgadmin');
const showMyOrg = isOrgAdmin; // sysadmin already has /admin/* — no need to duplicate
```

Placed alongside the existing **Students** entry. Icon: `Building2` from `lucide-react`.

### 7.6 i18n keys (en/sv/fi)

```
nav.myOrganisation
membership.columns.{org,user,role,actions}
membership.role.{orgadmin,instructor}
membership.add.{title,userPicker,orgPicker,rolePicker,submit,cancel}
membership.remove.confirm
membership.errors.{forbidden,conflict,selfDemoteBlocked,lastOrgadmin}
myOrganisation.{title,description,empty,multiOrgTabs}
```

Three locales, one block per topic.

## 8. Data flow

```
[ AdminUsersPage row click ]
   └─> <Sheet> opens
        └─> <MembershipManager scope={{kind:'user', userId}}>
             ├─ useMembershipsQuery({userId})  → GET /api/memberships?userId=…
             ├─ useAbility()                    → gates Remove + Add
             └─ <AddMembershipDialog>
                  ├─ <OrgPicker>   useOrganisationsQuery()
                  ├─ <RolePicker>  derived from ability
                  └─ submit → POST /api/memberships → invalidate ['membership']
```

Org-scope mirror swaps `userId` for `organisationId`, and the picker becomes a server-searched `<UserPicker>`. Same data layer, same mutations.

## 9. Error model

All backend errors are `{ error: { code, message } }`:

| Status | Code | Source | Frontend i18n key |
|---|---|---|---|
| 403 | `FORBIDDEN` | CASL denial | `membership.errors.forbidden` |
| 403 | `SELF_DEMOTE_BLOCKED` | §5.3 service guard | `membership.errors.selfDemoteBlocked` |
| 404 | `NOT_FOUND` | PATCH/DELETE on a missing id | reused from generic NOT_FOUND toast |
| 409 | `CONFLICT` | unique-index violation on `(user_id, org_id, role)` | `membership.errors.conflict` |
| 409 | `LAST_ORGADMIN` | §5.3 service guard | `membership.errors.lastOrgadmin` — confirm modal |

CASL-gated buttons are also hidden client-side so the user doesn't see broken-looking disabled states. The UI gate is UX; the server gate is security.

## 10. Edge cases

- **Grant a role the user already has** — unique index → 409 `CONFLICT`. Toast.
- **Last orgadmin in an org** — soft block with confirm; sysadmin only path.
- **Self-demote** — service guard + UI hides button on caller's own `orgadmin` rows.
- **Cascade delete of user or org** — DB cascade silently wipes memberships; next list query just returns fewer rows.
- **Picker performance** — server-side search on user picker; client-side on org picker (org count is bounded).
- **Multi-role row** — `[orgadmin, instructor]` for same user/org = 2 rows; remove one keeps the other.
- **Role-enum drift** — guarded by existing `role-enum-alignment.spec.ts`.

## 11. Testing

### Backend

| File | New cases | Notes |
|---|---|---|
| `memberships.abilities.spec.ts` (new) | 4 | sysadmin gets manage; orgadmin gets read on own org + create+delete on instructor-only; anon gets nothing; `$in` overlap matches across multi-org orgadmins |
| `memberships.service.spec.ts` (extend) | 5 | orgadmin lists own-org memberships; orgadmin self-demote → 403; sysadmin last-orgadmin → 409 without `confirm`; sysadmin last-orgadmin with `confirm=true` succeeds; orgadmin attempt to create `orgadmin` → 403 (CASL belt-and-braces) |

Backend tests: ~362 → ~371.

### Frontend

| File | New cases |
|---|---|
| `entities/membership/api/membership.api.test.ts` (new) | 4: getMemberships URL+filter, create body, delete URL (incl. `?confirm=true`), update body |
| `features/membership-manager/ui/MembershipManager.test.tsx` (new) | 5: user-scope rows; org-scope rows; remove hidden on own orgadmin row; remove confirm calls delete mutation; add button gated by ability |
| `features/membership-manager/ui/AddMembershipDialog.test.tsx` (new) | 3: user-scope shows org+role pickers; org-scope shows user+role pickers; role list filtered by ability |
| `pages/my-organisation/ui/MyOrganisationPage.test.tsx` (new) | 3: single-org case mounts manager; multi-org shows tabs; zero-orgadmin empty state |
| `pages/admin-users/ui/AdminUsersPage.test.tsx` (extend) | 1: row click opens drawer with MembershipManager |
| `pages/admin-organisations/ui/AdminOrganisationsPage.test.tsx` (extend or new) | 1: row click opens drawer with MembershipManager |
| `widgets/appsidebar/ui/AppSidebar.test.tsx` (extend) | 1: shows "My organisation" only for orgadmins |

Frontend tests: ~322 → ~340.

Contracts test suite: unchanged.

## 12. Acceptance criteria

A reviewer can verify the design has shipped when:

- Sysadmin opens `/admin/users`, clicks a user, sees the user's memberships, adds and removes a membership; the audit log records both with `actingUserId = sysadmin.id`.
- Sysadmin removes the last `orgadmin` of an org and sees a confirm dialog; clicking confirm completes the delete.
- Sysadmin opens `/admin/organisations`, clicks an org, sees its members, adds and removes.
- An orgadmin sees a new "My organisation" entry in the sidebar; clicking it lands them on `/my-organisation` showing their org's members. They can add and remove **instructors only** — the role picker has no `orgadmin` option, and `Remove` is hidden on their own row.
- A non-sysadmin, non-orgadmin user does NOT see "My organisation" in the sidebar.
- Backend + contracts + frontend pipelines all pass with no regressions.

## 13. Phasing inside this spec

Single plan, executed top-to-bottom (no internal sub-phasing). 11 tasks:

1. Backend §5.1 CASL widening + abilities spec
2. Backend §5.2 list-scope widening + service spec
3. Backend §5.3 self-demote + last-orgadmin guards + repository `countOrgadminsForOrg` + service spec
4. Contracts §6 `confirm?: boolean` + OpenAPI regen
5. Frontend §7.1 `entities/membership` API + hooks + tests
6. Frontend §7.2 `features/membership-manager` UI + dialog + tests
7. Frontend §7.3 admin-users + admin-organisations integration + tests
8. Frontend §7.4 `pages/my-organisation` + route + tests
9. Frontend §7.5 sidebar entry + test
10. i18n §7.6 keys for en/sv/fi
11. Full pipeline + clean tree

writing-plans will turn these into the canonical implementation plan with file maps, code snippets, and commit messages.
