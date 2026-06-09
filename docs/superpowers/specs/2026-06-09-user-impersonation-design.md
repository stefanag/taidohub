# User Impersonation Design

**Date:** 2026-06-09
**Status:** Approved

## 1. Goal

Allow a sysadmin to assume a non-sysadmin user's session so they can debug, support, or audit "what does this user see?" — with a strong visual reminder and a complete audit trail.

## 2. Non-goals

- Org-admin impersonation of org members (sysadmin only for now).
- Sysadmin → sysadmin impersonation (target restriction prevents privilege escalation if a sysadmin account is compromised).
- Force-end-by-target (the impersonated user does not get a notification or override).
- A dedicated impersonation history report page (the audit log captures everything; a UI is a follow-up).
- Cross-tab synchronisation (better-auth session cookies propagate naturally; banner refresh on focus is enough).

## 3. Data model

### 3.1 `audit_log.impersonated_by_id` (new column)

Add a nullable `impersonated_by_id text references "user"(id) on delete set null` column to the existing `audit_log` table. When a sysadmin acts during impersonation, this column carries the sysadmin's user ID. When set, the row's `user_id` is the impersonated user's ID (the actor in CASL terms).

Migration **0015** adds the column. Backfill is not required (existing rows keep `impersonated_by_id = NULL`).

### 3.2 `AuthenticatedUser.impersonatedBy` (TS shape)

```ts
interface AuthenticatedUser {
  id: string;
  role: Role;
  memberships: ReadonlyArray<{ organisationId: string; role: OrgRole }>;
  impersonatedBy?: string | undefined; // NEW — the real sysadmin's user ID during impersonation
}
```

The session-resolution layer (`AuthGuard` / better-auth glue) reads this from the session object that the better-auth admin plugin provides.

## 4. Backend

### 4.1 Enable better-auth admin plugin

`apps/backend/src/infrastructure/auth/better-auth.ts`:

```ts
import { admin } from 'better-auth/plugins';

export const auth = betterAuth({
  // … existing config …
  plugins: [
    admin({
      adminRoles: ['sysadmin'],
      impersonationSessionDuration: 60 * 60, // 1 hour
    }),
  ],
});
```

This auto-mounts:
- `POST /api/auth/admin/impersonate-user` (body: `{ userId }`)
- `POST /api/auth/admin/stop-impersonating`

### 4.2 Target-sysadmin block

The better-auth admin plugin does not natively forbid impersonating other admins. Add a `before` hook (or a small `ImpersonationGuard` in NestJS) that rejects with 403 when the target user's role is `sysadmin`:

```ts
admin({
  adminRoles: ['sysadmin'],
  impersonationSessionDuration: 60 * 60,
  hooks: {
    beforeImpersonate: async (ctx) => {
      const target = await getUserById(ctx.targetUserId);
      if (target?.role === 'sysadmin') {
        throw new ForbiddenError('Cannot impersonate another sysadmin.');
      }
    },
  },
});
```

(Exact hook shape per better-auth v1.x API at implementation time; equivalent NestJS guard pattern is acceptable.)

### 4.3 `AuthenticatedUser` resolution

`AuthGuard` reads the better-auth session and constructs `AuthenticatedUser`. Add a field:

```ts
const session = await auth.api.getSession({ headers });
const dbUser = session?.user;
return {
  id: dbUser.id,
  role: dbUser.role,
  memberships: …,
  impersonatedBy: session?.session?.impersonatedBy ?? undefined,
};
```

### 4.4 CASL semantics

`AbilityFactory.build(user)` receives the impersonated user. The CASL contributors operate on `user` unchanged — they have no idea impersonation is happening, and the sysadmin loses sysadmin powers for the duration. **This is the intended behaviour.** To regain sysadmin powers the user stops impersonating.

## 5. Audit log integration

`AuditLogService.record({ ... })` already accepts an `actorUser` argument. Extend it to also write `impersonated_by_id` when present:

```ts
async record(tx, { entityType, entityId, action, userId, before, after }, actorUser) {
  await tx.insert(auditLog).values({
    entityType, entityId, action,
    userId,
    impersonatedById: actorUser.impersonatedBy ?? null,
    before, after,
    createdAt: new Date(),
  });
}
```

### 5.1 Impersonation start/stop are themselves audit events

When `POST /admin/impersonate-user` succeeds, emit one audit row:
- `entityType = 'user_impersonation'`
- `entityId = <target user id>`
- `action = 'start'`
- `userId = <sysadmin id>`
- `impersonatedById = null` (this event was created by the sysadmin acting as themselves)

When `POST /admin/stop-impersonating` succeeds, emit:
- Same shape, `action = 'stop'`

This gives the audit log a clean start/stop bracket for every impersonation episode.

## 6. REST API surface

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/admin/impersonate-user` | sysadmin only | `{ userId }` | New session cookie set, returns `{ session }` |
| POST | `/api/auth/admin/stop-impersonating` | impersonating session | none | Original session restored, returns `{ session }` |
| GET | `/api/auth/get-session` | any authenticated | none | Existing endpoint; response now includes `session.impersonatedBy` |

OpenAPI is regenerated to reflect any new schemas surfaced. (better-auth admin endpoints are not in our OpenAPI by default since they're library-managed; we don't need to add them.)

## 7. Frontend

### 7.1 New slice: `features/user-impersonation/`

```
features/user-impersonation/
  api/
    impersonation.api.ts        # impersonateUser(id), stopImpersonating()
  lib/
    hooks.ts                    # useStartImpersonating(), useStopImpersonating()
  ui/
    ImpersonateActionButton.tsx # used by UsersTable + UserForm
    ConfirmImpersonateDialog.tsx
  index.ts
```

`impersonation.api.ts` calls `authClient.admin.impersonateUser({ userId })` (better-auth's client-side helper) and similar for stop.

### 7.2 New widget: `widgets/impersonation-banner/`

Mounted at the router root (`__root.tsx`). Reads `useSession()` and renders an amber banner across the top of the viewport when `session.session.impersonatedBy` is set:

```
[!] Impersonating Ada Lovelace (ada@example.com). Auto-ends in 47 min.   [Stop impersonating]
```

The countdown updates every minute. The "Stop impersonating" button calls `useStopImpersonating().mutate()` and navigates to `/admin/users` on success.

### 7.3 Entry points

- **UsersTable row action** (`features/users-table` already exists for the users admin page). Sysadmin-gated `Impersonate` action in the row's overflow menu. Hidden when the row's role is `sysadmin`.
- **UserForm Details tab** ([apps/frontend/src/features/user-form/ui/UserForm.tsx](apps/frontend/src/features/user-form/ui/UserForm.tsx)). Add an "Impersonate this user" button in the action row, sysadmin-only, hidden when target is sysadmin.

Both entry points open `ConfirmImpersonateDialog` which shows the target user's name and email and warns: "Your session will become this user's session. All actions are logged with both your ID and theirs. Auto-ends in 1 hour."

### 7.4 Visual treatment

- Banner background: `bg-warning-container` (gold) — non-default brand colour so it cannot be missed even when scrolling.
- Banner sticks to the top of the viewport (`position: sticky; top: 0; z-index: 40`) so it stays visible during scroll.
- Banner is always present, even on routes the impersonated user has access to.
- Confirmation dialog uses the existing Dialog primitive (md:min-h consistent with other dialogs).

### 7.5 i18n keys (en/sv/fi)

```
admin.users.impersonate.action          # "Impersonate"
admin.users.impersonate.confirmTitle    # "Start impersonating {name}?"
admin.users.impersonate.confirmBody     # "Your session will become this user's…"
admin.users.impersonate.confirm         # "Start impersonating"
admin.users.impersonate.banner          # "Impersonating {name} ({email}). Auto-ends in {minutes} min."
admin.users.impersonate.stop            # "Stop impersonating"
```

## 8. Session expiry

The better-auth admin plugin's `impersonationSessionDuration: 60 * 60` enforces a server-side 1-hour cap on each impersonation session. After 60 minutes the cookie expires and the next request requires the sysadmin to sign back in (or restores their original session if it's still valid — better-auth's behaviour applies).

The frontend's countdown is purely informational, derived from the session's `expiresAt`. If the user navigates away and back, the banner re-reads the session and updates.

## 9. Testing

### 9.1 Backend

- `admin.spec.ts` (new): cannot impersonate sysadmin (403). Can impersonate non-sysadmin (200). Stop works.
- `audit-log.service.spec.ts` (modify): when `actorUser.impersonatedBy` is set, the audit row carries `impersonatedById`.
- E2E (out of scope; deferred to a future hardening task).

### 9.2 Frontend

- `ConfirmImpersonateDialog.test.tsx` (new): renders target name + email; confirm button calls the mutation.
- `ImpersonationBanner.test.tsx` (new): renders only when session has `impersonatedBy`; clicking Stop calls the mutation.
- `UsersTable.test.tsx` (modify): Impersonate row action hidden for sysadmin rows.
- `UserForm.test.tsx` (modify): Impersonate button hidden when target is sysadmin.

## 10. Migration plan

**Deploy order matters slightly:**

1. Backend migration 0015 (`audit_log.impersonated_by_id`) — additive, zero-downtime.
2. Backend release: admin plugin enabled + audit-log integration.
3. Frontend release: banner mounted + entry points + i18n keys.

If the frontend ships before the backend, the entry points appear but clicking them hits 404 on `/api/auth/admin/impersonate-user`. Acceptable for the brief overlap; not a data-corruption risk.

## 11. Tasks summary

11 implementation tasks (see plan):

1. Backend: enable admin plugin in `better-auth.ts`
2. Backend: target-sysadmin block (hook or NestJS guard) + spec
3. DB: `audit_log.impersonated_by_id` column + migration 0015
4. Backend: `AuthenticatedUser.impersonatedBy` from session + spec
5. Backend: `AuditLogService` writes `impersonatedById` + spec update
6. Backend: emit start/stop impersonation audit events + spec
7. Frontend: `features/user-impersonation` API + hooks
8. Frontend: `ConfirmImpersonateDialog` + entry points in UsersTable + UserForm
9. Frontend: `widgets/impersonation-banner` mounted at router root
10. i18n keys (en/sv/fi)
11. Full pipeline pass

Out of scope (not tasks): an impersonation-history reporting page, force-end-by-target plumbing, org-admin impersonation. Each is a follow-up if/when the need arises.
