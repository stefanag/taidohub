# User Management — Phase 2 (Read + Role Management UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/admin/users` page — a sysadmin can list/search/filter users, change a user's global role, and manage that user's org-scoped memberships — backed by extended `GET /users` + new `PATCH /users/:id` endpoints.

**Architecture:** Backend adds paginated/filtered `GET /users` and a self-protected `PATCH /users/:id` (rejects self-demotion and last-sysadmin demotion). Frontend adds two FSD entity slices (`user`, `membership`), two widgets (`users-table`, `users-filters`), one feature (`user-form` with Details + Memberships tabs and an internal membership editor), one page (`admin-users`), and a CASL-gated route. Membership CRUD uses the `/memberships` endpoints that already shipped in Phase 1.

**Tech Stack:** TypeScript, Zod 4 (`@repo/contracts`), Drizzle ORM 0.45 + PostgreSQL, NestJS 11, CASL 6, React 19 + Vite + TanStack Router/Query, the in-house `useZodForm` hook, shadcn primitives + MD3 brand tokens, Vitest.

**Spec:** [`docs/superpowers/specs/2026-05-18-user-management-design.md`](../specs/2026-05-18-user-management-design.md). This plan implements **Phase 2 only** (spec §8 "Phase 2 — Read + role management UI"). Phase 3 (invite / deactivate / delete / password-reset) ships separately.

**Branch:** `feat/user-management-phase-2`. Create via `superpowers:using-git-worktrees` before Task 1.

**Carried-over fix:** Phase 1 migrated the role value `admin` → `sysadmin`, but the two existing admin route guards (`_app.admin.audit-log.tsx`, `_app.admin.organisations.tsx`) still check `role !== 'admin'` — meaning **both admin pages currently redirect everyone to `/dashboard` on `main`**. Task 7 fixes this alongside adding the new users route guard.

---

## File Structure

### Create

**Backend:**
- `apps/backend/src/modules/users/dto/list-users-query.dto.ts`
- `apps/backend/src/modules/users/dto/list-users-response.dto.ts`
- `apps/backend/src/modules/users/dto/update-user.dto.ts`

**Contracts:**
- (none — only modifications)

**Frontend:**
- `apps/frontend/src/entities/membership/api/membership.api.ts`
- `apps/frontend/src/entities/membership/model/membership.queries.ts`
- `apps/frontend/src/entities/membership/index.ts`
- `apps/frontend/src/entities/user/api/user.api.ts`
- `apps/frontend/src/entities/user/model/user.queries.ts`
- `apps/frontend/src/entities/user/index.ts`
- `apps/frontend/src/widgets/users-filters/ui/UsersFilters.tsx`
- `apps/frontend/src/widgets/users-filters/index.ts`
- `apps/frontend/src/widgets/users-table/ui/UsersTable.tsx`
- `apps/frontend/src/widgets/users-table/ui/UsersTable.test.tsx`
- `apps/frontend/src/widgets/users-table/index.ts`
- `apps/frontend/src/features/user-form/ui/UserForm.tsx`
- `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`
- `apps/frontend/src/features/user-form/ui/MembershipEditor.tsx`
- `apps/frontend/src/features/user-form/index.ts`
- `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx`
- `apps/frontend/src/pages/admin-users/index.ts`
- `apps/frontend/src/app/router/routes/_app.admin.users.tsx`

### Modify

**Contracts:**
- `packages/contracts/src/users.ts` — add `ListUsersQuerySchema`, `ListUsersResponseSchema`, `UpdateUserSchema` + types + registry entries.
- `packages/contracts/src/routes.ts` — add `MembershipsRoutes`.
- `packages/contracts/src/__tests__/users.test.ts` — tests for the new schemas.

**Backend:**
- `apps/backend/src/modules/users/users.repository.ts` — `list(filter)`, `update`, `countActiveSysadmins`.
- `apps/backend/src/modules/users/users.service.ts` — rewrite `list`, add `update`, inject `AuditLogService` + `DRIZZLE`.
- `apps/backend/src/modules/users/users.service.spec.ts` — list-with-filters + update + self-protection cases.
- `apps/backend/src/modules/users/users.controller.ts` — `GET /users` → `ListUsersResponse`, add `PATCH /users/:id`.
- `packages/contracts/openapi/openapi.{json,yaml}` — regenerated.

**Frontend:**
- `apps/frontend/src/app/router/routes/_app.admin.audit-log.tsx` — `admin` → `sysadmin`.
- `apps/frontend/src/app/router/routes/_app.admin.organisations.tsx` — `admin` → `sysadmin`.
- `apps/frontend/src/app/router/routeTree.gen.ts` — regenerated (auto).
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` — add the `Users` admin nav entry.
- `apps/frontend/src/i18n/locales/en.json`, `sv.json`, `fi.json` — `admin.users.*` + `nav.adminUsers` keys.

---

## Task 1: Contracts — list/update user schemas + MembershipsRoutes

**Files:**
- Modify: `packages/contracts/src/users.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/src/__tests__/users.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/contracts/src/__tests__/users.test.ts` (keep the existing `RoleSchema` / `UserSchema` blocks):

```ts
import {
  ListUsersQuerySchema,
  ListUsersResponseSchema,
  UpdateUserSchema,
} from '../users.js';

describe('ListUsersQuerySchema', () => {
  it('defaults deactivated=false, page=1, perPage=25', () => {
    const parsed = ListUsersQuerySchema.parse({});
    expect(parsed.deactivated).toBe('false');
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(25);
  });

  it('coerces query-string numbers', () => {
    const parsed = ListUsersQuerySchema.parse({ page: '3', perPage: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(50);
  });

  it('accepts the three deactivated values', () => {
    for (const v of ['true', 'false', 'all']) {
      expect(ListUsersQuerySchema.safeParse({ deactivated: v }).success).toBe(true);
    }
  });

  it('rejects an unknown deactivated value and perPage > 100', () => {
    expect(ListUsersQuerySchema.safeParse({ deactivated: 'maybe' }).success).toBe(false);
    expect(ListUsersQuerySchema.safeParse({ perPage: 200 }).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(ListUsersQuerySchema.safeParse({ role: 'admin' }).success).toBe(false);
  });
});

describe('UpdateUserSchema', () => {
  it('accepts a name-only patch', () => {
    expect(UpdateUserSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('accepts a role-only patch', () => {
    expect(UpdateUserSchema.safeParse({ role: 'sysadmin' }).success).toBe(true);
  });

  it('accepts an empty patch', () => {
    expect(UpdateUserSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown role and an empty name', () => {
    expect(UpdateUserSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('ListUsersResponseSchema', () => {
  it('accepts an empty page', () => {
    expect(
      ListUsersResponseSchema.safeParse({ data: [], total: 0, page: 1, perPage: 25 }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @repo/contracts test -- --run users`
Expected: FAIL — `ListUsersQuerySchema` / `ListUsersResponseSchema` / `UpdateUserSchema` are not exported.

- [ ] **Step 3: Add the schemas to `users.ts`**

In `packages/contracts/src/users.ts`, after the `UserSchema` declaration and its `User` type export, add:

```ts
export const ListUsersQuerySchema = z
  .object({
    q: z.string().optional(),
    role: RoleSchema.optional(),
    deactivated: z.enum(['true', 'false', 'all']).default('false'),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
  })
  .meta({ id: 'ListUsersQuery' });

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const ListUsersResponseSchema = z
  .object({
    data: UserSchema.array(),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    perPage: z.number().int().min(1),
  })
  .meta({ id: 'ListUsersResponse' });

export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

export const UpdateUserSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    role: RoleSchema.optional(),
  })
  .meta({ id: 'UpdateUserInput' });

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
```

Then extend `UsersOpenApiRegistry` so it reads:

```ts
export const UsersOpenApiRegistry = {
  Role: RoleSchema,
  User: UserSchema,
  ListUsersQuery: ListUsersQuerySchema,
  ListUsersResponse: ListUsersResponseSchema,
  UpdateUserInput: UpdateUserSchema,
} as const;
```

- [ ] **Step 4: Add `MembershipsRoutes` to `routes.ts`**

In `packages/contracts/src/routes.ts`, after the `AuditLogRoutes` block, add:

```ts
export const MembershipsRoutes = {
  base: '/api/memberships',
  byId: (id: string) => `/api/memberships/${id}` as const,
} as const;
```

- [ ] **Step 5: Run tests to verify they pass + build**

Run: `pnpm --filter @repo/contracts test -- --run users`
Expected: PASS — all new cases.

Run: `pnpm --filter @repo/contracts build`
Expected: build succeeds (the `memberships` and `users` entries re-emit cleanly).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/users.ts packages/contracts/src/routes.ts packages/contracts/src/__tests__/users.test.ts
git commit -m "feat(contracts): list/update user schemas + MembershipsRoutes"
```

---

## Task 2: `UsersRepository` — list/update/countActiveSysadmins

**Files:**
- Modify: `apps/backend/src/modules/users/users.repository.ts`

- [ ] **Step 1: Apply the repository change**

Replace the file contents of `apps/backend/src/modules/users/users.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { user, type DbUser } from '../../infrastructure/database/schema/index.js';

export interface ListUsersFilter {
  q?: string;
  role?: string;
  deactivated: 'true' | 'false' | 'all';
  page: number;
  perPage: number;
}

/**
 * Repository — the only file in the users module allowed to touch Drizzle.
 * Services consume its async methods; cross-module callers must go through
 * `UsersService`.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<DbUser | null> {
    const rows = await this.db.select().from(user).where(eq(user.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<DbUser | null> {
    const rows = await this.db.select().from(user).where(eq(user.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async list(filter: ListUsersFilter): Promise<{ rows: DbUser[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.q) {
      const needle = `%${filter.q}%`;
      const search = or(ilike(user.email, needle), ilike(user.name, needle));
      if (search) filters.push(search);
    }
    if (filter.role) filters.push(eq(user.role, filter.role));
    if (filter.deactivated === 'false') filters.push(isNull(user.deactivatedAt));
    else if (filter.deactivated === 'true') filters.push(isNotNull(user.deactivatedAt));
    const where = filters.length ? and(...filters) : undefined;

    const offset = (filter.page - 1) * filter.perPage;
    const rows = await this.db
      .select()
      .from(user)
      .where(where)
      .orderBy(user.email)
      .limit(filter.perPage)
      .offset(offset);
    const totalRows = await this.db.select({ value: count() }).from(user).where(where);
    return { rows, total: Number(totalRows[0]?.value ?? 0) };
  }

  async update(
    id: string,
    patch: { name?: string; role?: string },
    tx?: DrizzleExecutor,
  ): Promise<DbUser | null> {
    const conn = tx ?? this.db;
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.role !== undefined) set.role = patch.role;
    const rows = await conn.update(user).set(set).where(eq(user.id, id)).returning();
    return rows[0] ?? null;
  }

  /** Count users whose role is `sysadmin` and who are not deactivated. */
  async countActiveSysadmins(): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.role, 'sysadmin'), isNull(user.deactivatedAt)));
    return Number(rows[0]?.value ?? 0);
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter backend typecheck`
Expected: `users.repository.ts` compiles. `users.service.ts` will now error because it calls `repo.list()` with no arguments — that's fixed in Task 3. No other new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/users/users.repository.ts
git commit -m "feat(users): repository gains filtered list, update, countActiveSysadmins"
```

---

## Task 3: `UsersService.list` — paginated + filtered

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Open `apps/backend/src/modules/users/users.service.spec.ts`. It currently builds a real `AbilityFactory` with a stubbed `UsersRepository`. The repo stub will need the new methods. Update the repo stub factory so it includes `list`, `update`, `countActiveSysadmins`, `findByEmail` alongside `findById`. Then replace the existing `list` describe block (which expects `User[]`) with:

```ts
describe('UsersService — list', () => {
  it('rejects a non-sysadmin', async () => {
    const repo = usersRepoStub();
    const { service } = await makeService(repo);
    await expect(service.list({ deactivated: 'false', page: 1, perPage: 25 }, plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns a paginated response for a sysadmin', async () => {
    const repo = usersRepoStub();
    repo.list.mockResolvedValue({ rows: [USER_ROW], total: 1 });
    const { service } = await makeService(repo);

    const out = await service.list({ deactivated: 'false', page: 1, perPage: 25 }, sysadmin);

    expect(out).toMatchObject({ total: 1, page: 1, perPage: 25 });
    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.id).toBe(USER_ROW.id);
    expect(repo.list).toHaveBeenCalledWith({ deactivated: 'false', page: 1, perPage: 25 });
  });
});
```

`USER_ROW`, `sysadmin`, `plainUser`, `usersRepoStub`, and `makeService` are the spec's existing fixtures/helpers — if the current file names them differently, keep its names and adapt. `USER_ROW` is a DB-shaped row (`id`, `email`, `name`, `emailVerified`, `image`, `role`, `deactivatedAt: Date|null`, `createdAt: Date`, `updatedAt: Date`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backend test -- --run users.service`
Expected: FAIL — `service.list` still has the old `(user)` signature returning `User[]`.

- [ ] **Step 3: Rewrite `list` in the service**

In `apps/backend/src/modules/users/users.service.ts`, replace the existing `list` method. It currently is `async list(user): Promise<User[]>`. Change it to:

```ts
async list(
  query: ListUsersQuery,
  user: AuthenticatedUser | null,
): Promise<ListUsersResponse> {
  // Sysadmin-only gate: a sysadmin has `manage all` (covers `manage User`);
  // a plain user holds only a conditional `read User` rule, so the bare
  // `manage` check correctly fails for them.
  this.assertCan(user, 'manage');
  const { rows, total } = await this.repo.list({
    q: query.q,
    role: query.role,
    deactivated: query.deactivated,
    page: query.page,
    perPage: query.perPage,
  });
  return {
    data: rows.map((r) => this.toApi(r)),
    total,
    page: query.page,
    perPage: query.perPage,
  };
}
```

Update the import line at the top of the file so it brings in the new types:

```ts
import {
  type ListUsersQuery,
  type ListUsersResponse,
  type Role,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';
```

(`UpdateUserInput` is unused until Task 4 — TypeScript `import type` of an unused name is a lint warning, not an error; Task 4 consumes it. If you prefer, add `UpdateUserInput` in Task 4 instead. Either is fine.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backend test -- --run users.service`
Expected: PASS for the `list` block.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): paginated + filtered list service"
```

---

## Task 4: `UsersService.update` — name/role with self-protection

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts`
- Modify: `apps/backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/modules/users/users.service.spec.ts` a new describe block:

```ts
describe('UsersService — update', () => {
  it('rejects a non-sysadmin', async () => {
    const repo = usersRepoStub();
    repo.findById.mockResolvedValue(USER_ROW);
    const { service } = await makeService(repo);
    await expect(service.update(USER_ROW.id, { name: 'X' }, plainUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s when the user does not exist', async () => {
    const repo = usersRepoStub();
    repo.findById.mockResolvedValue(null);
    const { service } = await makeService(repo);
    await expect(service.update('missing', { name: 'X' }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates a name', async () => {
    const repo = usersRepoStub();
    repo.findById.mockResolvedValue(USER_ROW);
    repo.update.mockResolvedValue({ ...USER_ROW, name: 'Renamed' });
    const { service } = await makeService(repo);
    const out = await service.update(USER_ROW.id, { name: 'Renamed' }, sysadmin);
    expect(out.name).toBe('Renamed');
  });

  it('rejects a sysadmin changing their own role (SELF_DEMOTE)', async () => {
    const repo = usersRepoStub();
    // sysadmin editing themselves
    repo.findById.mockResolvedValue({ ...USER_ROW, id: sysadmin.id, role: 'sysadmin' });
    const { service } = await makeService(repo);
    await expect(
      service.update(sysadmin.id, { role: 'user' }, sysadmin),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects demoting the last active sysadmin (LAST_SYSADMIN)', async () => {
    const repo = usersRepoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'other-sysadmin', role: 'sysadmin' });
    repo.countActiveSysadmins.mockResolvedValue(1);
    const { service } = await makeService(repo);
    await expect(
      service.update('other-sysadmin', { role: 'user' }, sysadmin),
    ).rejects.toThrow(ConflictException);
  });

  it('allows demoting a sysadmin when others remain', async () => {
    const repo = usersRepoStub();
    repo.findById.mockResolvedValue({ ...USER_ROW, id: 'other-sysadmin', role: 'sysadmin' });
    repo.countActiveSysadmins.mockResolvedValue(2);
    repo.update.mockResolvedValue({ ...USER_ROW, id: 'other-sysadmin', role: 'user' });
    const { service } = await makeService(repo);
    const out = await service.update('other-sysadmin', { role: 'user' }, sysadmin);
    expect(out.role).toBe('user');
  });

  it('emits an audit-log update event', async () => {
    const repo = usersRepoStub();
    repo.findById.mockResolvedValue(USER_ROW);
    repo.update.mockResolvedValue({ ...USER_ROW, name: 'Renamed' });
    const { service, audit } = await makeService(repo);
    await service.update(USER_ROW.id, { name: 'Renamed' }, sysadmin);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      entityType: 'user',
      entityId: USER_ROW.id,
      action: 'update',
      userId: sysadmin.id,
    });
  });
});
```

This requires `makeService` to also provide `AuditLogService` (stubbed) and `DRIZZLE` (a fake `db` whose `transaction(cb)` runs `cb(FAKE_TX)`), mirroring `organisations.service.spec.ts`. Update `makeService` and the imports (`ConflictException`, `NotFoundException`) accordingly. Use the same `FAKE_TX` / `fakeDb` / `auditStub` pattern that `organisations.service.spec.ts` already uses — copy it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter backend test -- --run users.service`
Expected: FAIL — `service.update` does not exist.

- [ ] **Step 3: Add `update` to the service**

In `apps/backend/src/modules/users/users.service.ts`:

Add constructor dependencies for the audit log and the DB handle. The constructor becomes:

```ts
constructor(
  private readonly repo: UsersRepository,
  private readonly abilities: AbilityFactory,
  private readonly audit: AuditLogService,
  @Inject(DRIZZLE) private readonly db: DrizzleDb,
) {}
```

Add imports at the top:

```ts
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
```

(Merge the `@nestjs/common` import with the existing one — don't duplicate it.)

Add the `update` method:

```ts
async update(
  id: string,
  input: UpdateUserInput,
  user: AuthenticatedUser,
): Promise<User> {
  // Updating users is sysadmin-only. The bare `manage` check is correct:
  // only a sysadmin holds a `manage` rule for `User`.
  this.assertCan(user, 'manage');

  const existing = await this.repo.findById(id);
  if (!existing) {
    throw new NotFoundException({
      error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
    });
  }

  // Self-protection: a sysadmin cannot change their own role — a different
  // sysadmin must do it. In practice the only self role-change reachable
  // here is sysadmin → user (a demotion).
  if (input.role !== undefined && input.role !== existing.role && id === user.id) {
    throw new ConflictException({
      error: { code: 'SELF_DEMOTE', message: 'You cannot change your own role.' },
    });
  }

  // Self-protection: never leave the system with zero active sysadmins.
  if (input.role === 'user' && existing.role === 'sysadmin') {
    const remaining = await this.repo.countActiveSysadmins();
    if (remaining <= 1) {
      throw new ConflictException({
        error: {
          code: 'LAST_SYSADMIN',
          message: 'Cannot demote the last active sysadmin.',
        },
      });
    }
  }

  return this.db.transaction(async (tx) => {
    const row = await this.repo.update(id, input, tx);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    const before = this.toApi(existing);
    const after = this.toApi(row);
    await this.audit.record({
      tx,
      entityType: 'user',
      entityId: row.id,
      action: 'update',
      userId: user.id,
      before,
      after,
    });
    return after;
  });
}
```

Ensure `UpdateUserInput` is in the `@repo/contracts/users` import (added in Task 3's import block, or add it here).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter backend test -- --run users.service`
Expected: PASS — all `update` cases.

- [ ] **Step 5: Run the full backend test suite**

Run: `pnpm --filter backend test -- --run`
Expected: all green — no regressions in organisations/audit-log/memberships specs.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): update service with self-demote + last-sysadmin guards"
```

---

## Task 5: `UsersController` — extended list + PATCH

**Files:**
- Create: `apps/backend/src/modules/users/dto/list-users-query.dto.ts`
- Create: `apps/backend/src/modules/users/dto/list-users-response.dto.ts`
- Create: `apps/backend/src/modules/users/dto/update-user.dto.ts`
- Modify: `apps/backend/src/modules/users/users.controller.ts`

- [ ] **Step 1: Create the DTOs**

Create `apps/backend/src/modules/users/dto/list-users-query.dto.ts`:

```ts
import { ListUsersQuerySchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
```

Create `apps/backend/src/modules/users/dto/list-users-response.dto.ts`:

```ts
import { ListUsersResponseSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class ListUsersResponseDto extends createZodDto(ListUsersResponseSchema) {}
```

Create `apps/backend/src/modules/users/dto/update-user.dto.ts`:

```ts
import { UpdateUserSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
```

- [ ] **Step 2: Rewrite the controller**

Replace the file contents of `apps/backend/src/modules/users/users.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { ListUsersResponse, User } from '@repo/contracts/users';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ListUsersResponseDto } from './dto/list-users-response.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiCookieAuth('session')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user.', operationId: 'UsersController_me' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthenticatedUser | undefined): Promise<User> {
    if (!user) {
      // `AuthGuard` should have rejected the request already; defensive only.
      throw new Error('CurrentUser missing on a non-public route.');
    }
    return this.users.findOne(user.id, user);
  }

  @Get()
  @ApiEndpoint({
    summary: 'List users — paginated and filterable (sysadmin only).',
    operationId: 'UsersController_list',
    ok: ListUsersResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListUsersResponse> {
    return this.users.list(query, user);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiEndpoint({
    summary: 'Get a single user by id.',
    operationId: 'UsersController_findOne',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.findOne(id, user);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'User UUID.' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserDto })
  @ApiEndpoint({
    summary: 'Update a user’s name or role (sysadmin only).',
    operationId: 'UsersController_update',
    ok: UserDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<User> {
    return this.users.update(id, body, user);
  }
}
```

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm --filter backend typecheck`
Expected: 0 errors.

Run: `pnpm --filter backend test -- --run`
Expected: full suite green.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/users/dto/ apps/backend/src/modules/users/users.controller.ts
git commit -m "feat(users): controller exposes paginated list + PATCH"
```

---

## Task 6: Regenerate the OpenAPI spec

**Files:**
- Modify: `packages/contracts/openapi/openapi.json`
- Modify: `packages/contracts/openapi/openapi.yaml`

- [ ] **Step 1: Regenerate**

Run: `pnpm --filter backend openapi:generate`
Expected: writes `packages/contracts/openapi/openapi.{json,yaml}`. The diff should add the `PATCH /api/users/{id}` operation, change `GET /api/users` to return `ListUsersResponse`, and register the `ListUsersQuery` / `ListUsersResponse` / `UpdateUserInput` schemas.

- [ ] **Step 2: Sanity-check the diff**

Run: `git diff --stat packages/contracts/openapi/`
Expected: both files changed; no paths removed.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(openapi): regenerate for users list/patch endpoints"
```

---

## Task 7: Fix the admin route guards (`admin` → `sysadmin`)

**Files:**
- Modify: `apps/frontend/src/app/router/routes/_app.admin.audit-log.tsx`
- Modify: `apps/frontend/src/app/router/routes/_app.admin.organisations.tsx`

Phase 1 migrated the role value from `admin` to `sysadmin`, but these two route guards still test `role !== 'admin'`, so they currently redirect every user away from the admin pages.

- [ ] **Step 1: Fix the audit-log route guard**

In `apps/frontend/src/app/router/routes/_app.admin.audit-log.tsx`, change the role check inside `beforeLoad`:

```ts
      if (role !== 'sysadmin') {
        throw redirect({ to: '/dashboard' });
      }
```

- [ ] **Step 2: Fix the organisations route guard**

In `apps/frontend/src/app/router/routes/_app.admin.organisations.tsx`, make the identical change — `role !== 'admin'` → `role !== 'sysadmin'`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/router/routes/_app.admin.audit-log.tsx apps/frontend/src/app/router/routes/_app.admin.organisations.tsx
git commit -m "fix(frontend): admin route guards check sysadmin not the removed admin role"
```

---

## Task 8: `entities/membership` — API + queries

**Files:**
- Create: `apps/frontend/src/entities/membership/api/membership.api.ts`
- Create: `apps/frontend/src/entities/membership/model/membership.queries.ts`
- Create: `apps/frontend/src/entities/membership/index.ts`

- [ ] **Step 1: Create the API module**

Create `apps/frontend/src/entities/membership/api/membership.api.ts`:

```ts
import {
  ListMembershipsResponseSchema,
  OrganisationMembershipSchema,
  type CreateMembershipInput,
  type ListMembershipsQuery,
  type ListMembershipsResponse,
  type OrganisationMembership,
  type UpdateMembershipInput,
} from '@repo/contracts/memberships';
import { MembershipsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the OrganisationMembership entity. */

export async function listMemberships(
  query: ListMembershipsQuery = {},
): Promise<ListMembershipsResponse> {
  const raw = await httpClient(MembershipsRoutes.base, {
    query: { userId: query.userId, organisationId: query.organisationId },
  });
  return ListMembershipsResponseSchema.parse(raw);
}

export async function createMembership(
  input: CreateMembershipInput,
): Promise<OrganisationMembership> {
  const raw = await httpClient(MembershipsRoutes.base, { method: 'POST', body: input });
  return OrganisationMembershipSchema.parse(raw);
}

export async function updateMembership(
  id: string,
  input: UpdateMembershipInput,
): Promise<OrganisationMembership> {
  const raw = await httpClient(MembershipsRoutes.byId(id), { method: 'PATCH', body: input });
  return OrganisationMembershipSchema.parse(raw);
}

export async function deleteMembership(id: string): Promise<void> {
  await httpClient(MembershipsRoutes.byId(id), { method: 'DELETE' });
}
```

- [ ] **Step 2: Create the query module**

Create `apps/frontend/src/entities/membership/model/membership.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  CreateMembershipInput,
  ListMembershipsQuery,
  OrganisationMembership,
} from '@repo/contracts/memberships';

import {
  createMembership,
  deleteMembership,
  listMemberships,
  updateMembership,
} from '../api/membership.api.js';

export const membershipKeys = {
  all: ['memberships'] as const,
  lists: () => [...membershipKeys.all, 'list'] as const,
  list: (query: ListMembershipsQuery) => [...membershipKeys.lists(), query] as const,
};

export function listMembershipsQueryOptions(query: ListMembershipsQuery = {}) {
  return queryOptions({
    queryKey: membershipKeys.list(query),
    queryFn: () => listMemberships(query),
  });
}

// onSuccess composition: spread `options` FIRST, then define the invalidating
// `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot overwrite the
// invalidation. (Same pattern as the organisation entity.)
export function useCreateMembership(
  options?: Omit<UseMutationOptions<OrganisationMembership, Error, CreateMembershipInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMembership,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export interface UpdateMembershipVariables {
  id: string;
  role: OrganisationMembership['role'];
}

export function useUpdateMembership(
  options?: Omit<UseMutationOptions<OrganisationMembership, Error, UpdateMembershipVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: UpdateMembershipVariables) => updateMembership(id, { role }),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteMembership(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMembership(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 3: Create the barrel**

Create `apps/frontend/src/entities/membership/index.ts`:

```ts
export type {
  CreateMembershipInput,
  ListMembershipsQuery,
  ListMembershipsResponse,
  MembershipRole,
  OrganisationMembership,
  UpdateMembershipInput,
} from '@repo/contracts/memberships';

export {
  createMembership,
  deleteMembership,
  listMemberships,
  updateMembership,
} from './api/membership.api.js';

export {
  listMembershipsQueryOptions,
  membershipKeys,
  useCreateMembership,
  useDeleteMembership,
  useUpdateMembership,
  type UpdateMembershipVariables,
} from './model/membership.queries.js';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/entities/membership/
git commit -m "feat(frontend): membership entity — api + query hooks"
```

---

## Task 9: `entities/user` — API + queries

**Files:**
- Create: `apps/frontend/src/entities/user/api/user.api.ts`
- Create: `apps/frontend/src/entities/user/model/user.queries.ts`
- Create: `apps/frontend/src/entities/user/index.ts`

- [ ] **Step 1: Create the API module**

Create `apps/frontend/src/entities/user/api/user.api.ts`:

```ts
import {
  ListUsersResponseSchema,
  UserSchema,
  type ListUsersQuery,
  type ListUsersResponse,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';
import { UsersRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the admin-facing User operations. */

export async function listUsers(query: ListUsersQuery): Promise<ListUsersResponse> {
  const raw = await httpClient(UsersRoutes.base, {
    query: {
      q: query.q,
      role: query.role,
      deactivated: query.deactivated,
      page: query.page,
      perPage: query.perPage,
    },
  });
  return ListUsersResponseSchema.parse(raw);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const raw = await httpClient(UsersRoutes.byId(id), { method: 'PATCH', body: input });
  return UserSchema.parse(raw);
}
```

- [ ] **Step 2: Create the query module**

Create `apps/frontend/src/entities/user/model/user.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type { ListUsersQuery, UpdateUserInput, User } from '@repo/contracts/users';

import { listUsers, updateUser } from '../api/user.api.js';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (query: ListUsersQuery) => [...userKeys.lists(), query] as const,
};

export function listUsersQueryOptions(query: ListUsersQuery) {
  return queryOptions({
    queryKey: userKeys.list(query),
    queryFn: () => listUsers(query),
  });
}

export interface UpdateUserVariables {
  id: string;
  input: UpdateUserInput;
}

// onSuccess composition: spread `options` first, then the invalidator last.
export function useUpdateUser(
  options?: Omit<UseMutationOptions<User, Error, UpdateUserVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateUserVariables) => updateUser(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 3: Create the barrel**

Create `apps/frontend/src/entities/user/index.ts`:

```ts
export type {
  ListUsersQuery,
  ListUsersResponse,
  Role,
  UpdateUserInput,
  User,
} from '@repo/contracts/users';

export { listUsers, updateUser } from './api/user.api.js';

export {
  listUsersQueryOptions,
  useUpdateUser,
  userKeys,
  type UpdateUserVariables,
} from './model/user.queries.js';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/entities/user/
git commit -m "feat(frontend): user entity — admin list + update"
```

---

## Task 10: i18n keys for the users admin surface

**Files:**
- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Add the English keys**

In `apps/frontend/src/i18n/locales/en.json`: add `"adminUsers": "Users"` to the existing `nav` object, and add a new `users` object inside the existing `admin` object:

```json
    "users": {
      "title": "Users",
      "searchPlaceholder": "Search by email or name",
      "fields": {
        "email": "Email",
        "name": "Name",
        "role": "Role",
        "status": "Status"
      },
      "roles": {
        "sysadmin": "System administrator",
        "user": "User",
        "orgadmin": "Organisation administrator",
        "instructor": "Instructor"
      },
      "status": {
        "active": "Active",
        "deactivated": "Deactivated"
      },
      "filters": {
        "role": "Role",
        "allRoles": "All roles",
        "showDeactivated": "Show deactivated"
      },
      "memberships": {
        "title": "Memberships",
        "add": "Add membership",
        "organisation": "Organisation",
        "role": "Role",
        "empty": "No memberships yet.",
        "remove": "Remove",
        "instructorRequiresClub": "Instructor is only allowed on clubs."
      },
      "actions": {
        "edit": "Edit",
        "save": "Save"
      },
      "pager": {
        "prev": "Previous",
        "next": "Next",
        "page": "Page {{page}}"
      },
      "errors": {
        "selfDemote": "You cannot change your own role.",
        "lastSysadmin": "Cannot demote the last active sysadmin.",
        "membershipExists": "That membership already exists.",
        "instructorRequiresClub": "Instructor memberships are only allowed on clubs."
      }
    }
```

- [ ] **Step 2: Add the Swedish keys**

In `apps/frontend/src/i18n/locales/sv.json`: add `"adminUsers": "Användare"` to `nav`, and the `users` block inside `admin`:

```json
    "users": {
      "title": "Användare",
      "searchPlaceholder": "Sök på e-post eller namn",
      "fields": {
        "email": "E-post",
        "name": "Namn",
        "role": "Roll",
        "status": "Status"
      },
      "roles": {
        "sysadmin": "Systemadministratör",
        "user": "Användare",
        "orgadmin": "Organisationsadministratör",
        "instructor": "Instruktör"
      },
      "status": {
        "active": "Aktiv",
        "deactivated": "Inaktiverad"
      },
      "filters": {
        "role": "Roll",
        "allRoles": "Alla roller",
        "showDeactivated": "Visa inaktiverade"
      },
      "memberships": {
        "title": "Medlemskap",
        "add": "Lägg till medlemskap",
        "organisation": "Organisation",
        "role": "Roll",
        "empty": "Inga medlemskap än.",
        "remove": "Ta bort",
        "instructorRequiresClub": "Instruktör är endast tillåtet för klubbar."
      },
      "actions": {
        "edit": "Redigera",
        "save": "Spara"
      },
      "pager": {
        "prev": "Föregående",
        "next": "Nästa",
        "page": "Sida {{page}}"
      },
      "errors": {
        "selfDemote": "Du kan inte ändra din egen roll.",
        "lastSysadmin": "Kan inte degradera den sista aktiva systemadministratören.",
        "membershipExists": "Det medlemskapet finns redan.",
        "instructorRequiresClub": "Instruktörsmedlemskap är endast tillåtet för klubbar."
      }
    }
```

- [ ] **Step 3: Add the Finnish keys**

In `apps/frontend/src/i18n/locales/fi.json`: add `"adminUsers": "Käyttäjät"` to `nav`, and the `users` block inside `admin`:

```json
    "users": {
      "title": "Käyttäjät",
      "searchPlaceholder": "Hae sähköpostilla tai nimellä",
      "fields": {
        "email": "Sähköposti",
        "name": "Nimi",
        "role": "Rooli",
        "status": "Tila"
      },
      "roles": {
        "sysadmin": "Järjestelmänvalvoja",
        "user": "Käyttäjä",
        "orgadmin": "Organisaation ylläpitäjä",
        "instructor": "Ohjaaja"
      },
      "status": {
        "active": "Aktiivinen",
        "deactivated": "Poistettu käytöstä"
      },
      "filters": {
        "role": "Rooli",
        "allRoles": "Kaikki roolit",
        "showDeactivated": "Näytä käytöstä poistetut"
      },
      "memberships": {
        "title": "Jäsenyydet",
        "add": "Lisää jäsenyys",
        "organisation": "Organisaatio",
        "role": "Rooli",
        "empty": "Ei jäsenyyksiä vielä.",
        "remove": "Poista",
        "instructorRequiresClub": "Ohjaaja sallitaan vain seuroille."
      },
      "actions": {
        "edit": "Muokkaa",
        "save": "Tallenna"
      },
      "pager": {
        "prev": "Edellinen",
        "next": "Seuraava",
        "page": "Sivu {{page}}"
      },
      "errors": {
        "selfDemote": "Et voi muuttaa omaa rooliasi.",
        "lastSysadmin": "Viimeistä aktiivista järjestelmänvalvojaa ei voi alentaa.",
        "membershipExists": "Kyseinen jäsenyys on jo olemassa.",
        "instructorRequiresClub": "Ohjaajajäsenyydet sallitaan vain seuroille."
      }
    }
```

- [ ] **Step 4: Verify JSON validity**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors (the JSON imports must parse).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/i18n/locales/en.json apps/frontend/src/i18n/locales/sv.json apps/frontend/src/i18n/locales/fi.json
git commit -m "feat(i18n): admin.users.* keys for en/sv/fi"
```

---

## Task 11: `widgets/users-filters`

**Files:**
- Create: `apps/frontend/src/widgets/users-filters/ui/UsersFilters.tsx`
- Create: `apps/frontend/src/widgets/users-filters/index.ts`

- [ ] **Step 1: Create the widget**

Create `apps/frontend/src/widgets/users-filters/ui/UsersFilters.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ListUsersQuery } from '@/entities/user';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

export interface UsersFiltersProps {
  value: ListUsersQuery;
  onChange: (next: ListUsersQuery) => void;
}

const ALL_ROLES = '__all';

/**
 * Filter bar for the users admin table: free-text search, role select, and a
 * "show deactivated" toggle. Mirrors the audit-log-filters widget shape.
 * Every change resets `page` to 1.
 */
export function UsersFilters({ value, onChange }: UsersFiltersProps): React.ReactElement {
  const { t } = useTranslation();

  const patch = (delta: Partial<ListUsersQuery>): void => {
    onChange({ ...value, ...delta, page: 1 });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="users-search">
          {t('admin.users.searchPlaceholder', { defaultValue: 'Search by email or name' })}
        </Label>
        <Input
          id="users-search"
          value={value.q ?? ''}
          onChange={(e) => patch({ q: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="users-role">
          {t('admin.users.filters.role', { defaultValue: 'Role' })}
        </Label>
        <Select
          value={value.role ?? ALL_ROLES}
          onValueChange={(v) => patch({ role: v === ALL_ROLES ? undefined : (v as ListUsersQuery['role']) })}
        >
          <SelectTrigger id="users-role" aria-label={t('admin.users.filters.role', { defaultValue: 'Role' })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROLES}>
              {t('admin.users.filters.allRoles', { defaultValue: 'All roles' })}
            </SelectItem>
            <SelectItem value="sysadmin">
              {t('admin.users.roles.sysadmin', { defaultValue: 'System administrator' })}
            </SelectItem>
            <SelectItem value="user">
              {t('admin.users.roles.user', { defaultValue: 'User' })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.deactivated === 'all'}
            onChange={(e) => patch({ deactivated: e.target.checked ? 'all' : 'false' })}
          />
          {t('admin.users.filters.showDeactivated', { defaultValue: 'Show deactivated' })}
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/widgets/users-filters/index.ts`:

```ts
export { UsersFilters, type UsersFiltersProps } from './ui/UsersFilters.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors. If `@/shared/ui` does not re-export `Select*` / `Input` / `Label`, import them from their specific module paths (`@/shared/ui/select.js`, etc.) — check `apps/frontend/src/features/organisation-form/ui/OrganisationForm.tsx` for the exact import style and match it.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/widgets/users-filters/
git commit -m "feat(frontend): users-filters widget"
```

---

## Task 12: `widgets/users-table`

**Files:**
- Create: `apps/frontend/src/widgets/users-table/ui/UsersTable.tsx`
- Create: `apps/frontend/src/widgets/users-table/ui/UsersTable.test.tsx`
- Create: `apps/frontend/src/widgets/users-table/index.ts`

> **Scope note:** spec §7.3 lists "membership count" and "last-activity" columns. Both are deliberately **dropped** from Phase 2 — a per-user membership count needs a join or N+1 queries in the list endpoint, and last-activity isn't cheaply available. The table ships with email / name / role / status. Membership count can return once the list query grows a join; not worth the cost now.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/widgets/users-table/ui/UsersTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { User } from '@/entities/user';
import i18n from '@/i18n';

import { UsersTable } from './UsersTable.js';

const USER_A: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  emailVerified: true,
  image: null,
  role: 'sysadmin',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const USER_B: User = {
  ...USER_A,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'grace@example.com',
  name: 'Grace Hopper',
  role: 'user',
  deactivatedAt: '2026-02-01T00:00:00.000Z',
};

describe('<UsersTable>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the empty state when there are no users', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UsersTable users={[]} onEdit={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/no users/i)).toBeInTheDocument();
  });

  it('renders one row per user with email and name', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UsersTable users={[USER_A, USER_B]} onEdit={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('calls onEdit with the user when a row is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <UsersTable users={[USER_A]} onEdit={onEdit} />
      </I18nextProvider>,
    );
    await user.click(screen.getByText('ada@example.com'));
    expect(onEdit).toHaveBeenCalledWith(USER_A);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend test -- --run UsersTable`
Expected: FAIL — `UsersTable` module not found.

- [ ] **Step 3: Create the widget**

Create `apps/frontend/src/widgets/users-table/ui/UsersTable.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { User } from '@/entities/user';
import { Badge } from '@/shared/ui';

export interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
}

/**
 * Flat user list. Each row is clickable and opens the edit form. Columns:
 * email, name, role badge, status badge. MD3 brand tokens throughout.
 */
export function UsersTable({ users, onEdit }: UsersTableProps): React.ReactElement {
  const { t } = useTranslation();

  if (users.length === 0) {
    return (
      <p className="text-on-surface-variant">
        {t('admin.users.empty', { defaultValue: 'No users found.' })}
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs uppercase text-on-surface-variant">
        <tr>
          <th className="px-2 py-2">{t('admin.users.fields.email', { defaultValue: 'Email' })}</th>
          <th className="px-2 py-2">{t('admin.users.fields.name', { defaultValue: 'Name' })}</th>
          <th className="px-2 py-2">{t('admin.users.fields.role', { defaultValue: 'Role' })}</th>
          <th className="px-2 py-2">{t('admin.users.fields.status', { defaultValue: 'Status' })}</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr
            key={u.id}
            onClick={() => onEdit(u)}
            className="cursor-pointer border-b hover:bg-surface-container-low/50"
          >
            <td className="px-2 py-2">{u.email}</td>
            <td className="px-2 py-2">{u.name ?? '—'}</td>
            <td className="px-2 py-2">
              <Badge variant={u.role === 'sysadmin' ? 'default' : 'secondary'}>
                {t(`admin.users.roles.${u.role}`, { defaultValue: u.role })}
              </Badge>
            </td>
            <td className="px-2 py-2">
              {u.deactivatedAt ? (
                <Badge variant="outline">
                  {t('admin.users.status.deactivated', { defaultValue: 'Deactivated' })}
                </Badge>
              ) : (
                <span className="text-on-surface-variant">
                  {t('admin.users.status.active', { defaultValue: 'Active' })}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

If `Badge` is not re-exported from `@/shared/ui`, import it from `@/shared/ui/badge.js` — match the import style used by `apps/frontend/src/widgets/organisation-tree/ui/OrganisationTree.tsx`.

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/widgets/users-table/index.ts`:

```ts
export { UsersTable, type UsersTableProps } from './ui/UsersTable.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter frontend test -- --run UsersTable`
Expected: PASS — all three cases.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/widgets/users-table/
git commit -m "feat(frontend): users-table widget"
```

---

## Task 13: `features/user-form` — Details tab + form shell

**Files:**
- Create: `apps/frontend/src/features/user-form/ui/UserForm.tsx`
- Create: `apps/frontend/src/features/user-form/index.ts`

- [ ] **Step 1: Create the form (Details tab only for now)**

Create `apps/frontend/src/features/user-form/ui/UserForm.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Role, UpdateUserInput, User } from '@/entities/user';
import {
  Button,
  FormField,
  FormMessage,
  Input,
  Label,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

export interface UserFormProps {
  /** The user being edited. */
  user: User;
  /** Id of the currently signed-in admin — used to disable self-role-change. */
  currentUserId: string;
  /** Submit the Details-tab patch (name / role). */
  onSubmit: (input: UpdateUserInput) => Promise<void>;
  submitting?: boolean;
}

/**
 * Edit form for a user. Two tabs: Details (name + role) and Memberships.
 * Email is read-only — better-auth owns it. The role select is disabled when
 * an admin edits their own row (the backend also rejects self-demotion).
 *
 * The Memberships tab is filled in by a follow-up task; this shell renders
 * its trigger and an empty panel.
 */
export function UserForm({
  user,
  currentUserId,
  onSubmit,
  submitting,
}: UserFormProps): React.ReactElement {
  const { t } = useTranslation();
  const [name, setName] = React.useState<string>(user.name ?? '');
  const [role, setRole] = React.useState<Role>(user.role);
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const isSelf = user.id === currentUserId;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(undefined);
    const input: UpdateUserInput = {};
    if (name.trim() && name.trim() !== (user.name ?? '')) input.name = name.trim();
    if (role !== user.role) input.role = role;
    try {
      await onSubmit(input);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    }
  };

  return (
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTrigger value="details">
          {t('admin.auditLog.tabs.details', { defaultValue: 'Details' })}
        </TabsTrigger>
        <TabsTrigger value="memberships">
          {t('admin.users.memberships.title', { defaultValue: 'Memberships' })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField>
            <Label htmlFor="user-email">
              {t('admin.users.fields.email', { defaultValue: 'Email' })}
            </Label>
            <Input id="user-email" value={user.email} readOnly disabled />
          </FormField>

          <FormField>
            <Label htmlFor="user-name">
              {t('admin.users.fields.name', { defaultValue: 'Name' })}
            </Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="user-role">
              {t('admin.users.fields.role', { defaultValue: 'Role' })}
            </Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              disabled={isSelf}
            >
              <SelectTrigger id="user-role" aria-label={t('admin.users.fields.role', { defaultValue: 'Role' })}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sysadmin">
                  {t('admin.users.roles.sysadmin', { defaultValue: 'System administrator' })}
                </SelectItem>
                <SelectItem value="user">
                  {t('admin.users.roles.user', { defaultValue: 'User' })}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormMessage message={submitError} />

          <Button type="submit" disabled={submitting}>
            {t('admin.users.actions.save', { defaultValue: 'Save' })}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="memberships">
        {/* Filled in by the next task. */}
        <p className="text-on-surface-variant">
          {t('admin.users.memberships.empty', { defaultValue: 'No memberships yet.' })}
        </p>
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/features/user-form/index.ts`:

```ts
export { UserForm, type UserFormProps } from './ui/UserForm.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/user-form/
git commit -m "feat(frontend): user-form feature — Details tab"
```

---

## Task 14: `features/user-form` — Memberships tab + `MembershipEditor`

**Files:**
- Create: `apps/frontend/src/features/user-form/ui/MembershipEditor.tsx`
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.tsx`

The membership editor is an internal sub-component of the `user-form` feature (not its own slice) — this keeps it within one FSD feature and avoids a feature→feature import.

- [ ] **Step 1: Create the membership editor**

Create `apps/frontend/src/features/user-form/ui/MembershipEditor.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listOrganisationsQueryOptions } from '@/entities/organisation';
import type { MembershipRole } from '@/entities/membership';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Label,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface MembershipEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen organisation + role when the admin confirms. */
  onConfirm: (organisationId: string, role: MembershipRole) => Promise<void>;
  submitting?: boolean;
}

/**
 * Sub-dialog used by the user-form Memberships tab to add a new membership:
 * pick an organisation + a role. The `instructor` role is disabled unless the
 * picked organisation is a club (the backend enforces the same invariant).
 */
export function MembershipEditor({
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: MembershipEditorProps): React.ReactElement {
  const { t } = useTranslation();
  const { data } = useQuery(listOrganisationsQueryOptions());
  const organisations = data?.data ?? [];

  const [organisationId, setOrganisationId] = React.useState<string>('');
  const [role, setRole] = React.useState<MembershipRole>('orgadmin');
  const [error, setError] = React.useState<string | undefined>();

  const pickedOrg = organisations.find((o) => o.id === organisationId);
  const instructorAllowed = pickedOrg?.type === 'club';

  // Keep role consistent: if the picked org isn't a club, force orgadmin.
  React.useEffect(() => {
    if (!instructorAllowed && role === 'instructor') setRole('orgadmin');
  }, [instructorAllowed, role]);

  const handleConfirm = async (): Promise<void> => {
    setError(undefined);
    if (!organisationId) {
      setError(t('admin.users.memberships.organisation', { defaultValue: 'Organisation' }));
      return;
    }
    try {
      await onConfirm(organisationId, role);
      setOrganisationId('');
      setRole('orgadmin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.users.memberships.add', { defaultValue: 'Add membership' })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField>
            <Label htmlFor="membership-org">
              {t('admin.users.memberships.organisation', { defaultValue: 'Organisation' })}
            </Label>
            <Select value={organisationId} onValueChange={setOrganisationId}>
              <SelectTrigger
                id="membership-org"
                aria-label={t('admin.users.memberships.organisation', { defaultValue: 'Organisation' })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {organisations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nameEn} ({o.shortCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="membership-role">
              {t('admin.users.memberships.role', { defaultValue: 'Role' })}
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v as MembershipRole)}>
              <SelectTrigger
                id="membership-role"
                aria-label={t('admin.users.memberships.role', { defaultValue: 'Role' })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="orgadmin">
                  {t('admin.users.roles.orgadmin', { defaultValue: 'Organisation administrator' })}
                </SelectItem>
                <SelectItem value="instructor" disabled={!instructorAllowed}>
                  {t('admin.users.roles.instructor', { defaultValue: 'Instructor' })}
                </SelectItem>
              </SelectContent>
            </Select>
            {!instructorAllowed && organisationId ? (
              <p className="text-xs text-on-surface-variant">
                {t('admin.users.memberships.instructorRequiresClub', {
                  defaultValue: 'Instructor is only allowed on clubs.',
                })}
              </p>
            ) : null}
          </FormField>

          <FormMessage message={error} />

          <Button onClick={() => void handleConfirm()} disabled={submitting}>
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the Memberships tab in `UserForm.tsx`**

Replace the placeholder `<TabsContent value="memberships">` block in `apps/frontend/src/features/user-form/ui/UserForm.tsx` with a real panel. Add these imports at the top of the file:

```ts
import { useQuery } from '@tanstack/react-query';

import {
  listMembershipsQueryOptions,
  useCreateMembership,
  useDeleteMembership,
} from '@/entities/membership';
import { listOrganisationsQueryOptions } from '@/entities/organisation';

import { MembershipEditor } from './MembershipEditor.js';
```

Extend the import from `@/entities/membership` to also bring in `useUpdateMembership` and the `MembershipRole` type:

```ts
import {
  listMembershipsQueryOptions,
  useCreateMembership,
  useDeleteMembership,
  useUpdateMembership,
  type MembershipRole,
} from '@/entities/membership';
```

Inside the `UserForm` component body (before the `return`), add the membership data + handlers:

```ts
  const orgsQuery = useQuery(listOrganisationsQueryOptions());
  const orgById = React.useMemo(() => {
    const m = new Map<string, { label: string; type: string }>();
    for (const o of orgsQuery.data?.data ?? []) {
      m.set(o.id, { label: `${o.nameEn} (${o.shortCode})`, type: o.type });
    }
    return m;
  }, [orgsQuery.data]);

  const membershipsQuery = useQuery(listMembershipsQueryOptions({ userId: user.id }));
  const memberships = membershipsQuery.data?.data ?? [];

  const [editorOpen, setEditorOpen] = React.useState(false);
  const createMembership = useCreateMembership({ onSuccess: () => setEditorOpen(false) });
  const updateMembership = useUpdateMembership();
  const deleteMembership = useDeleteMembership();
```

Then replace the `memberships` `<TabsContent>` body with — each row carries an inline role `<Select>` (instructor disabled for non-club orgs) plus a Remove button:

```tsx
      <TabsContent value="memberships" className="space-y-3">
        {memberships.length === 0 ? (
          <p className="text-on-surface-variant">
            {t('admin.users.memberships.empty', { defaultValue: 'No memberships yet.' })}
          </p>
        ) : (
          <ul className="divide-y">
            {memberships.map((m) => {
              const org = orgById.get(m.organisationId);
              const isClub = org?.type === 'club';
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex-1 truncate text-sm">
                    {org?.label ?? m.organisationId}
                  </span>
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      updateMembership.mutate({ id: m.id, role: v as MembershipRole })
                    }
                  >
                    <SelectTrigger
                      className="w-44"
                      aria-label={t('admin.users.memberships.role', { defaultValue: 'Role' })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="orgadmin">
                        {t('admin.users.roles.orgadmin', { defaultValue: 'Organisation administrator' })}
                      </SelectItem>
                      <SelectItem value="instructor" disabled={!isClub}>
                        {t('admin.users.roles.instructor', { defaultValue: 'Instructor' })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMembership.mutate(m.id)}
                    disabled={deleteMembership.isPending}
                  >
                    {t('admin.users.memberships.remove', { defaultValue: 'Remove' })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
          {t('admin.users.memberships.add', { defaultValue: 'Add membership' })}
        </Button>

        <MembershipEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          submitting={createMembership.isPending}
          onConfirm={async (organisationId, role) => {
            await createMembership.mutateAsync({ userId: user.id, organisationId, role });
          }}
        />
      </TabsContent>
```

`Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` are already imported at the top of `UserForm.tsx` (from Task 13). `orgsQuery` is also used by `MembershipEditor` via its own `useQuery` — TanStack Query dedupes by query key, so both calling it is fine.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/user-form/
git commit -m "feat(frontend): user-form Memberships tab + membership editor"
```

---

## Task 15: `pages/admin-users`

**Files:**
- Create: `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx`
- Create: `apps/frontend/src/pages/admin-users/index.ts`

- [ ] **Step 1: Create the page**

Create `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth-by-email';
import {
  listUsersQueryOptions,
  useUpdateUser,
  type ListUsersQuery,
  type User,
} from '@/entities/user';
import { UserForm } from '@/features/user-form';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';
import { UsersFilters } from '@/widgets/users-filters';
import { UsersTable } from '@/widgets/users-table';

const INITIAL_QUERY: ListUsersQuery = { deactivated: 'false', page: 1, perPage: 25 };

/**
 * Admin page for managing user accounts: filter the list, open a user, edit
 * their name/role and memberships. A small state machine picks whether the
 * edit dialog is open.
 */
export function AdminUsersPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? '';

  const [query, setQuery] = React.useState<ListUsersQuery>(INITIAL_QUERY);
  const [editing, setEditing] = React.useState<User | null>(null);

  const { data, isLoading, isError, error } = useQuery(listUsersQueryOptions(query));

  const updateMut = useUpdateUser({ onSuccess: () => setEditing(null) });

  const setPage = (page: number): void => setQuery((q) => ({ ...q, page }));
  const total = data?.total ?? 0;
  const hasNext = query.page * query.perPage < total;

  return (
    <main className="container py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t('admin.users.title', { defaultValue: 'Users' })}
      </h1>

      <div className="mb-6">
        <UsersFilters value={query} onChange={setQuery} />
      </div>

      {isLoading ? (
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : isError ? (
        <p className="text-error">
          {error instanceof Error
            ? error.message
            : t('common.unknownError', { defaultValue: 'Unknown error' })}
        </p>
      ) : (
        <>
          <UsersTable users={data?.data ?? []} onEdit={(u) => setEditing(u)} />

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={query.page <= 1}
              onClick={() => setPage(query.page - 1)}
            >
              {t('admin.users.pager.prev', { defaultValue: 'Previous' })}
            </Button>
            <span className="text-sm text-on-surface-variant">
              {t('admin.users.pager.page', { defaultValue: 'Page {{page}}', page: query.page })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage(query.page + 1)}
            >
              {t('admin.users.pager.next', { defaultValue: 'Next' })}
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('admin.users.actions.edit', { defaultValue: 'Edit' })}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <UserForm
              user={editing}
              currentUserId={currentUserId}
              submitting={updateMut.isPending}
              onSubmit={async (input) => {
                await updateMut.mutateAsync({ id: editing.id, input });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
```

If `useSession` is not exported from `@/features/auth-by-email`, check that feature's `index.ts` for the correct export name (the audit-log/appsidebar code already consumes the session — match how `AppSidebar.tsx` reads the current user).

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/pages/admin-users/index.ts`:

```ts
export { AdminUsersPage } from './ui/AdminUsersPage.js';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/admin-users/
git commit -m "feat(frontend): admin-users page"
```

---

## Task 16: `/admin/users` route + route-tree regeneration

**Files:**
- Create: `apps/frontend/src/app/router/routes/_app.admin.users.tsx`
- Modify: `apps/frontend/src/app/router/routeTree.gen.ts` (auto-regenerated)

- [ ] **Step 1: Create the route**

Create `apps/frontend/src/app/router/routes/_app.admin.users.tsx`:

```tsx
import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminUsersPage } from '@/pages/admin-users';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the user-management page. Sits under `_app` so the
 * parent's session check still applies; this `beforeLoad` layers a sysadmin
 * check on top and redirects everyone else to `/dashboard`.
 */
export const adminUsersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/users',
  beforeLoad: async () => {
    try {
      const result = await authClient.getSession();
      const role = (result.data?.user as { role?: string } | undefined)?.role;
      if (role !== 'sysadmin') {
        throw redirect({ to: '/dashboard' });
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'options' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: AdminUsersPage,
});

export const Route = adminUsersRoute;
```

- [ ] **Step 2: Regenerate the route tree**

`routeTree.gen.ts` is generated by the TanStack Router Vite plugin. Run a build so the plugin picks up the new route file:

Run: `pnpm --filter frontend build`
Expected: build succeeds; `apps/frontend/src/app/router/routeTree.gen.ts` now references `_app.admin.users` (a new `AppAdminUsersRoute`).

If the build fails because the route tree is consulted before regeneration, run the dev server briefly instead (`pnpm --filter frontend dev`, wait for "ready", stop it) — that also triggers the plugin — then re-run the build.

- [ ] **Step 3: Verify the route tree updated**

Run: `git diff --stat apps/frontend/src/app/router/routeTree.gen.ts`
Expected: the file changed; it should now contain `admin/users`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/router/routes/_app.admin.users.tsx apps/frontend/src/app/router/routeTree.gen.ts
git commit -m "feat(frontend): /admin/users route (sysadmin-gated)"
```

---

## Task 17: AppSidebar — `Users` admin nav entry

**Files:**
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`

- [ ] **Step 1: Add the nav entry**

In `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`, the admin group is rendered inside an `ability?.can('manage', 'Organisation')` gate and currently lists `/admin/organisations` and `/admin/audit-log`. Add a third `<SidebarMenuItem>` for users.

First add `Users` to the existing `lucide-react` import line, e.g.:

```ts
import { Building2, History, LayoutDashboard, LogOut, Users } from 'lucide-react';
```

Then, inside the admin `<SidebarMenu>`, add a new item (place it first, above Organisations) gated so only sysadmins see it. The admin group is already behind `ability?.can('manage', 'Organisation')`; gate this specific entry on `ability?.can('manage', 'User')`:

```tsx
                {ability?.can('manage', 'User') ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/admin/users')}
                    >
                      <Link to="/admin/users">
                        <Users />
                        <span>{t('nav.adminUsers')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
```

Match the exact JSX shape of the existing `/admin/organisations` item in the file (same `SidebarMenuItem` / `SidebarMenuButton` / `Link` nesting).

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter frontend typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(frontend): Users entry in the admin sidebar group"
```

---

## Task 18: Component tests — `UserForm` + `MembershipEditor`

**Files:**
- Create: `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`
- Create: `apps/frontend/src/features/user-form/ui/MembershipEditor.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/entities/user';
import i18n from '@/i18n';

import { UserForm } from './UserForm.js';

// The Memberships tab fetches organisations + memberships. Stub both entity
// API modules so the form renders without a live backend.
vi.mock('@/entities/organisation', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});
vi.mock('@/entities/membership', async (orig) => {
  const actual = await orig<typeof import('@/entities/membership')>();
  return { ...actual, listMemberships: vi.fn().mockResolvedValue({ data: [], total: 0 }) };
});

const TARGET: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  emailVerified: true,
  image: null,
  role: 'user',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderForm(overrides: Partial<React.ComponentProps<typeof UserForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <UserForm user={TARGET} currentUserId="some-other-admin" onSubmit={onSubmit} {...overrides} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('<UserForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the email read-only', () => {
    renderForm();
    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveValue('ada@example.com');
    expect(email).toBeDisabled();
  });

  it('submits a changed name', async () => {
    const { onSubmit, user } = renderForm();
    const name = screen.getByLabelText(/name/i);
    await user.clear(name);
    await user.type(name, 'Ada L.');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada L.' });
  });

  it('disables the role select when editing yourself', () => {
    renderForm({ currentUserId: TARGET.id });
    expect(screen.getByRole('combobox', { name: /role/i })).toBeDisabled();
  });

  it('enables the role select when editing someone else', () => {
    renderForm({ currentUserId: 'some-other-admin' });
    expect(screen.getByRole('combobox', { name: /role/i })).not.toBeDisabled();
  });
});
```

If the `vi.mock` factory paths don't line up with how the entity barrels are structured, follow the pattern in `apps/frontend/src/widgets/audit-log-table/ui/AuditLogTable.test.tsx` — it mocks an entity API module and is the reference for this codebase.

- [ ] **Step 2: Run the UserForm test**

Run: `pnpm --filter frontend test -- --run UserForm`
Expected: PASS — all four cases.

- [ ] **Step 3: Write the MembershipEditor test**

Create `apps/frontend/src/features/user-form/ui/MembershipEditor.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

import { MembershipEditor } from './MembershipEditor.js';

// One club + one national federation, so the instructor-club rule has both
// a passing and a failing case to exercise.
const CLUB = {
  id: 'club-1', parentId: 'nf-1', type: 'club', shortCode: 'STK', slug: null,
  country: 'SWE', nameEn: 'Stockholm Club', nameSv: 'x', nameFi: 'x', nameJa: null,
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const NF = { ...CLUB, id: 'nf-1', parentId: 'if-1', type: 'national_federation', shortCode: 'STF', nameEn: 'Swedish Fed' };

vi.mock('@/entities/organisation', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation')>();
  return { ...actual, listOrganisations: vi.fn().mockResolvedValue({ data: [CLUB, NF], total: 2 }) };
});

function renderEditor() {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MembershipEditor open onOpenChange={vi.fn()} onConfirm={onConfirm} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onConfirm, user: userEvent.setup() };
}

describe('<MembershipEditor>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the organisation and role pickers', () => {
    renderEditor();
    expect(screen.getByLabelText(/organisation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  it('disables the instructor option until a club is picked', async () => {
    const { user } = renderEditor();
    // Open the organisation select and wait for the mocked orgs to populate.
    await waitFor(() => expect(screen.getByLabelText(/organisation/i)).toBeInTheDocument());
    await user.click(screen.getByLabelText(/organisation/i));
    await user.click(await screen.findByText(/Swedish Fed/));

    // With a non-club org picked, the role select must not offer instructor.
    await user.click(screen.getByLabelText(/role/i));
    const instructor = await screen.findByRole('option', { name: /instructor/i });
    expect(instructor).toHaveAttribute('aria-disabled', 'true');
  });

  it('allows instructor once a club is picked', async () => {
    const { user } = renderEditor();
    await waitFor(() => expect(screen.getByLabelText(/organisation/i)).toBeInTheDocument());
    await user.click(screen.getByLabelText(/organisation/i));
    await user.click(await screen.findByText(/Stockholm Club/));

    await user.click(screen.getByLabelText(/role/i));
    const instructor = await screen.findByRole('option', { name: /instructor/i });
    expect(instructor).not.toHaveAttribute('aria-disabled', 'true');
  });
});
```

If the Radix Select option assertions are flaky (portal timing), match the query approach in `apps/frontend/src/features/organisation-form/ui/OrganisationForm.test.tsx` / `OrganisationMoveDialog.test.tsx` — those already drive shadcn `Select` components in tests and are the reference for this codebase. The essential assertion is "instructor is disabled for a non-club org, enabled for a club" — keep that even if the exact querying differs.

- [ ] **Step 4: Run both test files**

Run: `pnpm --filter frontend test -- --run user-form`
Expected: PASS — `UserForm.test.tsx` (4 cases) + `MembershipEditor.test.tsx` (3 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/user-form/ui/UserForm.test.tsx apps/frontend/src/features/user-form/ui/MembershipEditor.test.tsx
git commit -m "test(frontend): UserForm + MembershipEditor component tests"
```

---

## Task 19: Full pipeline + manual verification

**Files:** none modified.

- [ ] **Step 1: Run the full monorepo pipeline**

Run: `pnpm turbo run typecheck lint arch test build`
Expected: every task green across `@repo/contracts`, `backend`, `frontend`. 0 type errors, 0 lint errors, 0 Steiger arch errors, all tests pass.

If Steiger flags an FSD violation, inspect it: the membership editor lives *inside* `features/user-form/` (not a separate slice) precisely to avoid a feature→feature import, and `pages/admin-users` composing widgets + a feature is allowed. If Steiger still complains, report it rather than adding an override without understanding why.

- [ ] **Step 2: Manual smoke test**

Start both dev servers:
```
pnpm --filter backend dev
pnpm --filter frontend dev
```

As the seeded sysadmin:
- Sign in, confirm the sidebar now shows `Organisations`, `Audit log`, AND `Users`.
- Open `/admin/users` — the table lists users; search by email filters; the role filter works; the "show deactivated" toggle includes/excludes deactivated rows.
- Click a user → the edit dialog opens. Change the name, Save → the row updates, the dialog closes.
- On a *different* user, change the role `user` → `sysadmin`, Save → succeeds.
- Open your *own* row → the role select is disabled.
- Try (via a second sysadmin, or by reasoning) the last-sysadmin guard: demoting the only sysadmin returns a 409 surfaced in the form.
- Memberships tab: add an `orgadmin` membership on any org; add an `instructor` membership — confirm `instructor` is disabled unless the picked org is a club; remove a membership.
- Confirm every mutation shows up in `/admin/audit-log` with `entityType` `user` or `organisation_membership`.

- [ ] **Step 3: No commit — verification only**

Open a PR from `feat/user-management-phase-2` into `main`.

---

## Done when

- `GET /api/users` is paginated + filterable and returns `ListUsersResponse`; `PATCH /api/users/:id` updates name/role with the self-demote and last-sysadmin guards.
- `/admin/users` is reachable by a sysadmin (and only a sysadmin) and the existing `/admin/organisations` + `/admin/audit-log` pages are reachable again (the stale `admin` role guard is fixed).
- A sysadmin can search/filter users, change a user's role, and add/edit/remove that user's org-scoped memberships — every change recorded in the audit log.
- The sidebar shows a `Users` entry for sysadmins.
- `pnpm turbo run typecheck lint arch test build` is green across all three packages; the OpenAPI spec is regenerated and committed.

After Phase 2 merges, the Phase 3 plan (invite / deactivate / delete / password-reset) can be written.
