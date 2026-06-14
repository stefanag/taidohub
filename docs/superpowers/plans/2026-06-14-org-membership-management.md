# Org Membership Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sysadmins manage all org memberships (already wired for user-scope; add org-scope) and let orgadmins manage `instructor` memberships in their own org(s) via a new `/my-organisation` page.

**Architecture:** Widen the existing `MembershipsAbilityRules` so orgadmins can `read` their org's memberships and `create`/`delete` instructor-only rows. Widen `MembershipsService.list` so non-sysadmins can also filter by an org they orgadmin. Add a service-layer self-demote guard and a sysadmin-only last-orgadmin confirm flow (new `?confirm=true` query). Reuse existing `entities/membership` queryOptions; add an org-scoped sibling to the existing `MembershipEditor`; mount it from a new Sheet on `AdminOrganisationsPage` and a new `/my-organisation` page.

**Tech Stack:** NestJS 11 + CASL 6 + Drizzle ORM · Zod 4 · React 19 + TanStack Router + TanStack Query v5 + shadcn UI · i18next.

**Spec:** `docs/superpowers/specs/2026-06-13-org-membership-management-design.md` (commit `233cf27`)

---

## What already exists (do NOT recreate)

Read these before starting — the spec was authored before some of this code was found:

- `apps/backend/src/modules/memberships/` — full CRUD module + controller + service + repository + `MembershipsAbilityRules` + audit-log emission on every mutation.
- `apps/frontend/src/entities/membership/` — `listMemberships`, `createMembership`, `updateMembership`, `deleteMembership` API + `membershipKeys` + `listMembershipsQueryOptions(query)` + `useCreateMembership` / `useUpdateMembership` / `useDeleteMembership` mutation hooks. `listMemberships(query)` already accepts `userId` and `organisationId` filters.
- `apps/frontend/src/features/user-form/ui/MembershipEditor.tsx` — sysadmin user-scope dialog: org picker + role picker. Has a subtle existing invariant — the `instructor` role is disabled unless the picked org's `type === 'club'` (backend enforces the same).
- `apps/frontend/src/pages/admin-users/ui/AdminUsersPage.tsx` — already opens a `UserForm` dialog with a "Memberships" tab on row click.
- `apps/frontend/src/shared/lib/casl/{ability-context.ts,defineAbilityFor.ts}` + `apps/frontend/src/app/providers/AbilityProvider.tsx` — frontend CASL surface. Gating is done via `<Can I="…" a="OrganisationMembership" this={instance}>…</Can>` or `React.useContext(AbilityContext)`.
- `apps/frontend/src/entities/me/` — already exports `useMyMembershipsQuery()` (Phase 3.5).
- `apps/frontend/src/shared/ui/sheet.tsx` — shadcn Sheet primitive.

---

## File Structure

**Backend — modify:**
- `apps/backend/src/modules/memberships/memberships.abilities.ts` — widen for orgadmins.
- `apps/backend/src/modules/memberships/memberships.service.ts` — `list` scope widening, `delete` self-demote + last-orgadmin guards.
- `apps/backend/src/modules/memberships/memberships.service.spec.ts` — extend with new cases.
- `apps/backend/src/modules/memberships/memberships.repository.ts` — add `countOrgadminsForOrg(orgId)`.
- `apps/backend/src/modules/memberships/memberships.controller.ts` — accept `confirm` query on `DELETE`.
- `apps/backend/src/modules/memberships/dto/delete-membership-query.dto.ts` (new) — Zod DTO for the new query.

**Backend — create:**
- `apps/backend/src/modules/memberships/memberships.abilities.spec.ts` — new isolated abilities spec.

**Contracts:**
- `packages/contracts/src/memberships.ts` — add `DeleteMembershipQuerySchema` with `confirm?: boolean`.
- `packages/contracts/openapi/openapi.{yaml,json}` — regenerated.

**Frontend — modify:**
- `apps/frontend/src/entities/membership/api/membership.api.ts` — `deleteMembership(id, options?: { confirm?: boolean })`.
- `apps/frontend/src/entities/membership/api/membership.api.test.ts` — extend test for the confirm query.
- `apps/frontend/src/entities/membership/model/membership.queries.ts` — `useDeleteMembership` mutationFn now passes `{confirm}`.
- `apps/frontend/src/features/user-form/ui/UserForm.tsx` (or `MembershipsTab.tsx` if separate) — catch `LAST_ORGADMIN` 409 on delete + run confirm dialog + re-issue with `confirm: true`.
- `apps/frontend/src/pages/admin-organisations/ui/AdminOrganisationsPage.tsx` — open a Sheet "Members" drawer on row click.
- `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx` — add "My organisation" entry, gated on `isOrgAdmin`.
- `apps/frontend/src/i18n/locales/{en,sv,fi}.json` — new keys.

**Frontend — create:**
- `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipManager.tsx` — org-scoped member table + add button.
- `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipManager.test.tsx`
- `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipEditor.tsx` — user-picker dialog (mirror of `MembershipEditor`).
- `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipEditor.test.tsx`
- `apps/frontend/src/features/org-membership-manager/index.ts`
- `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.tsx`
- `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.test.tsx`
- `apps/frontend/src/pages/my-organisation/index.ts`
- `apps/frontend/src/app/router/routes/_app.my-organisation.tsx`
- `apps/frontend/src/app/router/routeTree.gen.ts` — append new route (hand-edit; the file has `@ts-nocheck`).

---

## Task 1: Backend — widen `MembershipsAbilityRules` for orgadmins

**Files:**
- Modify: `apps/backend/src/modules/memberships/memberships.abilities.ts`
- Create: `apps/backend/src/modules/memberships/memberships.abilities.spec.ts`

### Step 0: Recon

Read these for pattern:
- Current `memberships.abilities.ts` — sysadmin-only.
- `apps/backend/src/modules/students/students.ability-rules.ts` (Phase 3.5) — has the exact `$in` array-overlap pattern + `never` cast for the TS gap. Copy the structure.
- `apps/backend/src/modules/students/students.ability-rules.spec.ts` — testing pattern.

### Step 1: Write the failing spec

Create `apps/backend/src/modules/memberships/memberships.abilities.spec.ts`:

```ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, it, expect } from 'vitest';

import { type AppAbility } from '../../infrastructure/ability/ability.types.js';
import { MembershipsAbilityRules } from './memberships.abilities.js';

function buildFor(user: any): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new MembershipsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('MembershipsAbilityRules', () => {
  it('sysadmin can manage every OrganisationMembership', () => {
    const ability = buildFor({ id: 'u1', role: 'sysadmin', memberships: [] });
    expect(
      ability.can('manage', {
        __caslSubjectType__: 'OrganisationMembership' as const,
        organisationId: 'any',
        role: 'orgadmin',
      }),
    ).toBe(true);
  });

  it('orgadmin in org A can read all roles in org A but not in org B', () => {
    const ability = buildFor({
      id: 'u1',
      role: 'user',
      memberships: [{ organisationId: 'A', role: 'orgadmin' }],
    });
    const orgadminInA = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'A',
      role: 'orgadmin',
    };
    const instructorInB = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'B',
      role: 'instructor',
    };
    expect(ability.can('read', orgadminInA)).toBe(true);
    expect(ability.can('read', instructorInB)).toBe(false);
  });

  it('orgadmin can create + delete instructor rows in their org but not orgadmin rows', () => {
    const ability = buildFor({
      id: 'u1',
      role: 'user',
      memberships: [{ organisationId: 'A', role: 'orgadmin' }],
    });
    const instructorInA = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'A',
      role: 'instructor',
    };
    const orgadminInA = {
      __caslSubjectType__: 'OrganisationMembership' as const,
      organisationId: 'A',
      role: 'orgadmin',
    };
    expect(ability.can('create', instructorInA)).toBe(true);
    expect(ability.can('delete', instructorInA)).toBe(true);
    expect(ability.can('create', orgadminInA)).toBe(false);
    expect(ability.can('delete', orgadminInA)).toBe(false);
    expect(ability.can('update', instructorInA)).toBe(false);
  });

  it('anonymous gets nothing', () => {
    const ability = buildFor(null);
    expect(
      ability.can('read', {
        __caslSubjectType__: 'OrganisationMembership' as const,
        organisationId: 'A',
        role: 'instructor',
      }),
    ).toBe(false);
  });
});
```

### Step 2: Run spec — should fail (rules still sysadmin-only)

Run: `pnpm --filter backend exec vitest run src/modules/memberships/memberships.abilities.spec`

Expected: 3 of 4 tests fail. (Sysadmin + anonymous pass since those branches already exist.)

### Step 3: Implement widening

Replace the contents of `apps/backend/src/modules/memberships/memberships.abilities.ts`:

```ts
import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Sysadmin can manage all OrganisationMembership rows. An orgadmin can read
 * every membership row in any org they orgadmin, and create or delete
 * instructor-role rows in those orgs. Updates are sysadmin-only — orgadmins
 * who need a role swap delete + create.
 */
@Injectable()
export class MembershipsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'OrganisationMembership');
      return;
    }
    const orgs = user.memberships
      .filter((m) => m.role === 'orgadmin')
      .map((m) => m.organisationId);
    if (orgs.length === 0) return;

    builder.can('read', 'OrganisationMembership', { organisationId: { $in: orgs } } as never);
    builder.can('create', 'OrganisationMembership', {
      organisationId: { $in: orgs },
      role: 'instructor',
    } as never);
    builder.can('delete', 'OrganisationMembership', {
      organisationId: { $in: orgs },
      role: 'instructor',
    } as never);
    // No 'update' — intentional (see spec §4).
  }
}
```

### Step 4: Run spec — all 4 pass

Run: `pnpm --filter backend exec vitest run src/modules/memberships/memberships.abilities.spec`

Expected: 4/4 PASS.

### Step 5: Re-run full memberships suite to confirm no regressions

Run: `pnpm --filter backend exec vitest run src/modules/memberships`

Expected: existing tests still pass; new spec adds 4.

### Step 6: Commit

```bash
git add apps/backend/src/modules/memberships/memberships.abilities.ts \
        apps/backend/src/modules/memberships/memberships.abilities.spec.ts
git commit -m "feat(memberships): widen CASL — orgadmins can manage instructor rows in their org"
```

---

## Task 2: Backend — `MembershipsService.list` scope widening

**Files:**
- Modify: `apps/backend/src/modules/memberships/memberships.service.ts`
- Modify: `apps/backend/src/modules/memberships/memberships.service.spec.ts`

### Step 0: Recon

Read the existing `MembershipsService.list` method to find the current self-only guard. Then read `students.service.ts` (Phase 3.5) for the `actor.memberships.filter(...).map(...)` pattern.

### Step 1: Add failing tests

Append to `apps/backend/src/modules/memberships/memberships.service.spec.ts`:

```ts
describe('list — orgadmin scope', () => {
  it('orgadmin in org A can list memberships filtered by organisationId=A', async () => {
    const actor = {
      id: 'orgadmin-1',
      role: 'user' as const,
      memberships: [{ organisationId: 'A', role: 'orgadmin' as const }],
    };
    repo.list.mockResolvedValue({ data: [], page: 1, perPage: 25, total: 0 });
    await expect(service.list({ organisationId: 'A' }, actor)).resolves.toBeDefined();
    expect(repo.list).toHaveBeenCalledWith({ organisationId: 'A' });
  });

  it('orgadmin in org A cannot list memberships of org B', async () => {
    const actor = {
      id: 'orgadmin-1',
      role: 'user' as const,
      memberships: [{ organisationId: 'A', role: 'orgadmin' as const }],
    };
    await expect(service.list({ organisationId: 'B' }, actor)).rejects.toThrow(/FORBIDDEN/);
  });

  it('non-orgadmin can still filter by own userId only (existing behaviour)', async () => {
    const actor = { id: 'u1', role: 'user' as const, memberships: [] };
    repo.list.mockResolvedValue({ data: [], page: 1, perPage: 25, total: 0 });
    await expect(service.list({ userId: 'u1' }, actor)).resolves.toBeDefined();
    await expect(service.list({ userId: 'someone-else' }, actor)).rejects.toThrow(/FORBIDDEN/);
  });
});
```

### Step 2: Run — 3 new tests fail

Run: `pnpm --filter backend exec vitest run src/modules/memberships/memberships.service.spec -t "list — orgadmin scope"`

Expected: 3/3 FAIL on the "cannot list org B" branch (currently the service throws for any non-self filter).

### Step 3: Implement widening

In `memberships.service.ts`, replace the existing `list` method's guard with:

```ts
async list(
  query: ListMembershipsQuery,
  actor: AuthenticatedUser,
): Promise<ListMembershipsResponse> {
  if (actor.role === 'sysadmin') {
    return this.repo.list(query);
  }

  const orgAdminOrgs = actor.memberships
    .filter((m) => m.role === 'orgadmin')
    .map((m) => m.organisationId);

  const isOwnUserFilter = query.userId === actor.id;
  const isOrgAdminScopedFilter =
    query.organisationId !== undefined && orgAdminOrgs.includes(query.organisationId);

  if (isOwnUserFilter || isOrgAdminScopedFilter) {
    return this.repo.list(query);
  }

  throw new ForbiddenException({
    error: {
      code: 'FORBIDDEN',
      message: 'Cannot list memberships outside your own scope.',
    },
  });
}
```

(`ForbiddenException` and `ListMembershipsResponse` are already imported; if not, copy the import from how the existing code references them.)

### Step 4: Run service spec — passes

Run: `pnpm --filter backend exec vitest run src/modules/memberships/memberships.service.spec`

Expected: all existing tests + 3 new ones pass.

### Step 5: Commit

```bash
git add apps/backend/src/modules/memberships/memberships.service.ts \
        apps/backend/src/modules/memberships/memberships.service.spec.ts
git commit -m "feat(memberships): orgadmins can list memberships of their own orgs"
```

---

## Task 3: Backend — self-demote + last-orgadmin guards

**Files:**
- Modify: `apps/backend/src/modules/memberships/memberships.repository.ts` — add `countOrgadminsForOrg(orgId)`.
- Modify: `apps/backend/src/modules/memberships/memberships.service.ts` — `delete(id, actor, opts?: { confirm?: boolean })`.
- Modify: `apps/backend/src/modules/memberships/memberships.service.spec.ts` — 4 new cases.

### Step 0: Recon

Read the existing `delete` method to see how it pulls the existing row and how it calls audit. Note the existing imports of `ConflictException`, `ForbiddenException` (or add them).

### Step 1: Add `countOrgadminsForOrg` to the repository

In `memberships.repository.ts`:

```ts
async countOrgadminsForOrg(organisationId: string, tx?: DrizzleExecutor): Promise<number> {
  const conn = tx ?? this.db;
  const rows = await conn
    .select({ value: count() })
    .from(organisationMembership)
    .where(
      and(
        eq(organisationMembership.organisationId, organisationId),
        eq(organisationMembership.role, 'orgadmin'),
      ),
    );
  return Number(rows[0]?.value ?? 0);
}
```

Add the missing `count`, `and`, `eq` imports from `drizzle-orm` if they aren't already there; `organisationMembership` is the table import already used in the file.

### Step 2: Add failing tests

Append to `memberships.service.spec.ts`:

```ts
describe('delete — guards', () => {
  it('orgadmin removing their own orgadmin row → SELF_DEMOTE_BLOCKED', async () => {
    const actor = {
      id: 'me',
      role: 'user' as const,
      memberships: [{ organisationId: 'A', role: 'orgadmin' as const }],
    };
    repo.findById.mockResolvedValue({
      id: 'm-1',
      userId: 'me',
      organisationId: 'A',
      role: 'orgadmin',
    });
    await expect(service.delete('m-1', actor, {})).rejects.toThrow(/SELF_DEMOTE_BLOCKED/);
  });

  it('sysadmin deleting last orgadmin without confirm → LAST_ORGADMIN', async () => {
    const sysadmin = { id: 'sys', role: 'sysadmin' as const, memberships: [] };
    repo.findById.mockResolvedValue({
      id: 'm-1',
      userId: 'someone',
      organisationId: 'A',
      role: 'orgadmin',
    });
    repo.countOrgadminsForOrg.mockResolvedValue(1);
    await expect(service.delete('m-1', sysadmin, {})).rejects.toThrow(/LAST_ORGADMIN/);
  });

  it('sysadmin deleting last orgadmin WITH confirm=true → succeeds', async () => {
    const sysadmin = { id: 'sys', role: 'sysadmin' as const, memberships: [] };
    repo.findById.mockResolvedValue({
      id: 'm-1',
      userId: 'someone',
      organisationId: 'A',
      role: 'orgadmin',
    });
    repo.countOrgadminsForOrg.mockResolvedValue(1);
    repo.delete.mockResolvedValue(undefined);
    await expect(service.delete('m-1', sysadmin, { confirm: true })).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith('m-1');
  });

  it('sysadmin deleting a non-last orgadmin → succeeds without confirm', async () => {
    const sysadmin = { id: 'sys', role: 'sysadmin' as const, memberships: [] };
    repo.findById.mockResolvedValue({
      id: 'm-1',
      userId: 'someone',
      organisationId: 'A',
      role: 'orgadmin',
    });
    repo.countOrgadminsForOrg.mockResolvedValue(3);
    repo.delete.mockResolvedValue(undefined);
    await expect(service.delete('m-1', sysadmin, {})).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith('m-1');
  });
});
```

Add `countOrgadminsForOrg: vi.fn()` to the repository stub at the top of the file.

### Step 3: Run — 4 tests fail

Run: `pnpm --filter backend exec vitest run src/modules/memberships/memberships.service.spec -t "delete — guards"`

Expected: 4/4 FAIL.

### Step 4: Update `MembershipsService.delete`

Find the existing `async delete(id: string, actor: AuthenticatedUser): Promise<void>` and rewrite to:

```ts
async delete(
  id: string,
  actor: AuthenticatedUser,
  opts: { confirm?: boolean } = {},
): Promise<void> {
  const existing = await this.repo.findById(id);
  if (!existing) {
    throw new NotFoundException({
      error: { code: 'NOT_FOUND', message: `Membership ${id} not found.` },
    });
  }

  // Self-demote: a non-sysadmin cannot remove their own orgadmin row.
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

  // Last-orgadmin: sysadmin-only path (CASL already blocks orgadmins from
  // touching orgadmin rows). Soft block — frontend re-issues with confirm.
  if (existing.role === 'orgadmin' && actor.role === 'sysadmin') {
    const remaining = await this.repo.countOrgadminsForOrg(existing.organisationId);
    if (remaining <= 1 && !opts.confirm) {
      throw new ConflictException({
        error: {
          code: 'LAST_ORGADMIN',
          message: 'This is the last orgadmin in the organisation.',
        },
      });
    }
  }

  await this.repo.delete(id);
  // Leave existing audit.record({...}) call intact.
}
```

If the existing method had inline audit emission, KEEP IT — just thread the new code around it. Don't drop the audit call.

### Step 5: Run all memberships tests

Run: `pnpm --filter backend exec vitest run src/modules/memberships`

Expected: all pass (4 new + existing).

### Step 6: Commit

```bash
git add apps/backend/src/modules/memberships/memberships.repository.ts \
        apps/backend/src/modules/memberships/memberships.service.ts \
        apps/backend/src/modules/memberships/memberships.service.spec.ts
git commit -m "feat(memberships): self-demote + last-orgadmin guards on delete"
```

---

## Task 4: Backend — accept `?confirm=true` on `DELETE /api/memberships/:id`

**Files:**
- Create: `apps/backend/src/modules/memberships/dto/delete-membership-query.dto.ts`
- Modify: `apps/backend/src/modules/memberships/memberships.controller.ts`

### Step 0: Recon

Read the existing controller `DELETE` method and look at how other controllers use Zod query DTOs (e.g. `ListMembershipsQueryDto`). Match the import + decorator pattern.

### Step 1: Create the DTO

`apps/backend/src/modules/memberships/dto/delete-membership-query.dto.ts`:

```ts
import { z } from 'zod';

// Note: ZodValidationPipe coerces string 'true'/'false' to boolean via z.coerce.
export const DeleteMembershipQuerySchema = z.object({
  confirm: z.coerce.boolean().optional(),
});

export type DeleteMembershipQuery = z.infer<typeof DeleteMembershipQuerySchema>;
```

If the project's existing DTO style uses `class-validator` decorators instead of plain Zod schemas (look at `ListMembershipsQueryDto`), match THAT style. The Zod-only form above is a fallback.

### Step 2: Wire into controller

In `memberships.controller.ts`, change the `remove` method:

```ts
@Delete(':id')
@CheckAbility('delete', 'OrganisationMembership')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiParam({ name: 'id', description: 'Membership UUID.' })
@ApiQuery({ name: 'confirm', required: false, type: Boolean })
@ApiNoContentResponse({ description: 'Membership deleted.' })
@ApiEndpoint({
  summary: 'Delete a membership (sysadmin-everywhere; orgadmin for instructor rows in own org).',
  operationId: 'MembershipsController_delete',
  errorType: ErrorEnvelopeDto,
  errors: ['401', '403', '404', '409'],
})
async remove(
  @Param('id', new ParseUUIDPipe()) id: string,
  @Query() query: DeleteMembershipQuery,
  @CurrentUser() user: AuthenticatedUser,
): Promise<void> {
  await this.memberships.delete(id, user, { confirm: query.confirm });
}
```

Import `Query`, `ApiQuery`, `DeleteMembershipQuery` at the top of the file. Use the project's `ZodValidationPipe` on `@Query()` if that's the convention — copy from how list query is decorated.

### Step 3: Verify backend

```bash
cd apps/backend && npx tsc --noEmit
pnpm --filter backend exec vitest run
```

Expected: typecheck clean, all tests pass.

### Step 4: Commit

```bash
git add apps/backend/src/modules/memberships/dto/delete-membership-query.dto.ts \
        apps/backend/src/modules/memberships/memberships.controller.ts
git commit -m "feat(memberships): DELETE /api/memberships/:id?confirm= query param"
```

---

## Task 5: Contracts — `confirm?: boolean` on delete query + OpenAPI regen

**Files:**
- Modify: `packages/contracts/src/memberships.ts`
- Regenerated: `packages/contracts/openapi/openapi.{yaml,json}`

### Step 1: Add the schema

In `packages/contracts/src/memberships.ts`, append:

```ts
export const DeleteMembershipQuerySchema = z.object({
  confirm: z.boolean().optional(),
}).meta({
  id: 'DeleteMembershipQuery',
  description: 'Optional flag to bypass the LAST_ORGADMIN guard on DELETE /api/memberships/:id.',
});

export type DeleteMembershipQuery = z.infer<typeof DeleteMembershipQuerySchema>;
```

Add it to whichever `*OpenApiRegistry` is at the bottom of that file (look at how `ListMembershipsQuery` is registered).

### Step 2: Verify contracts

```bash
cd packages/contracts && npx tsc --noEmit
pnpm --filter @repo/contracts exec vitest run
pnpm --filter @repo/contracts build
```

Expected: all clean.

### Step 3: Regenerate OpenAPI

```bash
pnpm openapi:generate
```

Verify the diff in `packages/contracts/openapi/openapi.yaml` includes a `confirm` query parameter on the `DELETE /memberships/{id}` operation, and a `DeleteMembershipQuery` schema. No other endpoints should change.

### Step 4: Commit

```bash
git add packages/contracts/src/memberships.ts \
        packages/contracts/openapi/openapi.json \
        packages/contracts/openapi/openapi.yaml
git commit -m "feat(contracts): DeleteMembershipQuery + OpenAPI regen"
```

---

## Task 6: Frontend — thread `confirm` through `deleteMembership` + hook

**Files:**
- Modify: `apps/frontend/src/entities/membership/api/membership.api.ts`
- Modify: `apps/frontend/src/entities/membership/api/membership.api.test.ts`
- Modify: `apps/frontend/src/entities/membership/model/membership.queries.ts`

### Step 0: Recon

Read the existing `deleteMembership` and `useDeleteMembership`. The current signature is `deleteMembership(id: string)` and the mutation's `mutationFn: deleteMembership`. We change the API function to accept `{ confirm? }`, change the hook's variables type to `{ id: string; confirm?: boolean }`, and update tests.

### Step 1: Failing test

In `apps/frontend/src/entities/membership/api/membership.api.test.ts`, add:

```ts
it('deleteMembership passes ?confirm=true when given the flag', async () => {
  await deleteMembership('m-1', { confirm: true });
  expect(httpClient).toHaveBeenCalledWith(
    MembershipsRoutes.byId('m-1'),
    expect.objectContaining({
      method: 'DELETE',
      query: { confirm: true },
    }),
  );
});

it('deleteMembership omits confirm when not given', async () => {
  await deleteMembership('m-1');
  expect(httpClient).toHaveBeenCalledWith(
    MembershipsRoutes.byId('m-1'),
    expect.objectContaining({ method: 'DELETE' }),
  );
});
```

Match the project's existing test for `deleteMembership` (URL builder + mock). If `httpClient` doesn't support a `query` option, instead test the URL string the API builds.

### Step 2: Run — fails (signature mismatch)

`pnpm --filter frontend exec vitest run src/entities/membership/api/membership.api.test`

Expected: at least one failure on the new tests.

### Step 3: Update the API function

In `membership.api.ts`:

```ts
export async function deleteMembership(
  id: string,
  options: { confirm?: boolean } = {},
): Promise<void> {
  await httpClient(MembershipsRoutes.byId(id), {
    method: 'DELETE',
    query: options.confirm ? { confirm: true } : undefined,
  });
}
```

If `httpClient` builds query strings differently in this project (look at `listMemberships` which passes `query: { userId, organisationId }`), match THAT pattern.

### Step 4: Update the mutation hook

In `membership.queries.ts`, change `useDeleteMembership` so the mutation variable type is `{ id: string; confirm?: boolean }`:

```ts
export interface DeleteMembershipVariables {
  id: string;
  confirm?: boolean;
}

export function useDeleteMembership(
  options?: Omit<UseMutationOptions<void, Error, DeleteMembershipVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: DeleteMembershipVariables) => deleteMembership(id, { confirm }),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: membershipKeys.all });
      // Also invalidate `me/memberships` so the sidebar gating refetches when
      // the caller's own membership set changes.
      void queryClient.invalidateQueries({ queryKey: ['me', 'memberships'] });
      options?.onSuccess?.(...args);
    },
  });
}
```

If the existing hook had a different variable shape (e.g. just `string`), update every CALL SITE. Run a project-wide grep:

```bash
grep -rn "useDeleteMembership(" apps/frontend/src --include='*.ts' --include='*.tsx'
```

Likely call sites: `apps/frontend/src/features/user-form/`. Update each to pass `{ id, confirm? }` instead of bare `id`.

### Step 5: Run + typecheck

```bash
pnpm --filter frontend exec vitest run src/entities/membership
cd apps/frontend && npx tsc --noEmit
```

Expected: all entity tests pass; full frontend typechecks (any broken call sites surfaced here).

### Step 6: Commit

```bash
git add apps/frontend/src/entities/membership/ \
        apps/frontend/src/features/user-form/  # if call sites changed
git commit -m "feat(entities-membership): thread confirm flag through delete + invalidate me/memberships"
```

---

## Task 7: Frontend — new `<OrgMembershipManager>` + `<OrgMembershipEditor>` feature

**Files:**
- Create: `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipManager.tsx`
- Create: `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipManager.test.tsx`
- Create: `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipEditor.tsx`
- Create: `apps/frontend/src/features/org-membership-manager/ui/OrgMembershipEditor.test.tsx`
- Create: `apps/frontend/src/features/org-membership-manager/index.ts`

### Step 0: Recon

Read these for one-to-one reference:
- `apps/frontend/src/features/user-form/ui/MembershipEditor.tsx` — the user-scope sibling. Copy structure; swap org picker for user picker.
- `apps/frontend/src/entities/user/model/user.queries.ts` — `listUsersQueryOptions(query)`. Used for the user picker.
- `apps/frontend/src/features/student-progress-editor-dialog/` (Phase 3.5) — for jsdom pointer-capture stubs + general dialog test scaffolding.

### Step 1: Write `OrgMembershipEditor`

```tsx
// apps/frontend/src/features/org-membership-manager/ui/OrgMembershipEditor.tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { MembershipRole } from '@/entities/membership';
import { listUsersQueryOptions } from '@/entities/user';
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

export interface OrgMembershipEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Roles the caller may grant in this org. Filtered by the caller's ability. */
  allowedRoles: readonly MembershipRole[];
  /** Called with the chosen user + role when the admin confirms. */
  onConfirm: (userId: string, role: MembershipRole) => Promise<void>;
  submitting?: boolean;
}

/**
 * Org-scope sibling of <MembershipEditor>: pick a user + role to add to
 * the org. Caller-supplied `allowedRoles` already reflects the actor's
 * ability (sysadmin: [orgadmin, instructor]; orgadmin: [instructor]).
 */
export function OrgMembershipEditor({
  open,
  onOpenChange,
  allowedRoles,
  onConfirm,
  submitting,
}: OrgMembershipEditorProps): React.ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);

  const { data } = useQuery(
    listUsersQueryOptions({ search: debouncedSearch || undefined, page: 1, perPage: 25 }),
  );
  const users = data?.data ?? [];

  const [userId, setUserId] = React.useState<string>('');
  const [role, setRole] = React.useState<MembershipRole>(allowedRoles[0] ?? 'instructor');
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) {
      setUserId('');
      setSearch('');
      setRole(allowedRoles[0] ?? 'instructor');
      setError(undefined);
    }
  }, [open, allowedRoles]);

  async function handleConfirm(): Promise<void> {
    if (!userId) {
      setError(t('membership.add.userPickerRequired'));
      return;
    }
    setError(undefined);
    try {
      await onConfirm(userId, role);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('membership.add.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <FormField>
            <Label htmlFor="org-mem-search">{t('membership.add.userPicker')}</Label>
            <input
              id="org-mem-search"
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder={t('membership.add.userPickerPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder={t('membership.add.userPickerSelect')} /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ? `${u.name} — ${u.email}` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField>
            <Label>{t('membership.add.rolePicker')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MembershipRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>{t(`membership.role.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('membership.add.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={submitting}>
              {t('membership.add.submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
```

### Step 2: Write `OrgMembershipManager`

```tsx
// apps/frontend/src/features/org-membership-manager/ui/OrgMembershipManager.tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listMembershipsQueryOptions,
  useCreateMembership,
  useDeleteMembership,
  type MembershipRole,
} from '@/entities/membership';
import { useSession } from '@/features/auth-by-email';
import { AbilityContext } from '@/shared/lib/casl/ability-context.js';
import { Button } from '@/shared/ui';

import { OrgMembershipEditor } from './OrgMembershipEditor.js';

export interface OrgMembershipManagerProps {
  organisationId: string;
  orgLabel: string;
}

/**
 * Org-scope members table for an organisation: lists all current memberships
 * (one row per role), gates Add + Remove by the caller's CASL ability, and
 * handles the LAST_ORGADMIN confirm flow inline.
 */
export function OrgMembershipManager({
  organisationId,
  orgLabel,
}: OrgMembershipManagerProps): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const actorId = session.data?.user?.id ?? '';
  const ability = React.useContext(AbilityContext);

  const { data, isPending } = useQuery(listMembershipsQueryOptions({ organisationId }));
  const rows = data?.data ?? [];

  const create = useCreateMembership();
  const remove = useDeleteMembership();

  const [adding, setAdding] = React.useState(false);
  const [lastOrgadminConfirm, setLastOrgadminConfirm] = React.useState<{
    membershipId: string;
  } | null>(null);

  const allowedRoles = React.useMemo<MembershipRole[]>(() => {
    if (!ability) return [];
    const candidates: MembershipRole[] = ['orgadmin', 'instructor'];
    return candidates.filter((role) =>
      ability.can('create', {
        __caslSubjectType__: 'OrganisationMembership' as const,
        organisationId,
        role,
      } as never),
    );
  }, [ability, organisationId]);

  const canAdd = allowedRoles.length > 0;

  async function handleAdd(userId: string, role: MembershipRole): Promise<void> {
    await create.mutateAsync({ userId, organisationId, role });
  }

  async function handleRemove(membershipId: string, confirmFlag = false): Promise<void> {
    try {
      await remove.mutateAsync({ id: membershipId, confirm: confirmFlag });
    } catch (err: unknown) {
      // Detect the LAST_ORGADMIN soft block and queue a confirm.
      if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: number }).status === 409 &&
        'body' in err &&
        ((err as { body?: { error?: { code?: string } } }).body?.error?.code === 'LAST_ORGADMIN')
      ) {
        setLastOrgadminConfirm({ membershipId });
        return;
      }
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('membership.org.title', { org: orgLabel })}</h3>
        {canAdd ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t('membership.add.title')}
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">{t('membership.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('membership.empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">{t('membership.columns.user')}</th>
              <th className="py-2">{t('membership.columns.role')}</th>
              <th className="py-2 text-right">{t('membership.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isOwnOrgadmin = m.userId === actorId && m.role === 'orgadmin';
              const canDelete =
                !!ability &&
                ability.can('delete', {
                  __caslSubjectType__: 'OrganisationMembership' as const,
                  organisationId: m.organisationId,
                  role: m.role,
                } as never);
              return (
                <tr key={m.id} className="border-b">
                  <td className="py-2">{m.user?.email ?? m.userId}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {t(`membership.role.${m.role}`)}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {canDelete && !isOwnOrgadmin ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(t('membership.remove.confirm'))) {
                            void handleRemove(m.id);
                          }
                        }}
                      >
                        {t('membership.remove.label')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <OrgMembershipEditor
        open={adding}
        onOpenChange={setAdding}
        allowedRoles={allowedRoles}
        onConfirm={handleAdd}
        submitting={create.isPending}
      />

      {lastOrgadminConfirm ? (
        <ConfirmLastOrgadmin
          onCancel={() => setLastOrgadminConfirm(null)}
          onConfirm={async () => {
            await handleRemove(lastOrgadminConfirm.membershipId, true);
            setLastOrgadminConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmLastOrgadmin({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): React.ReactElement {
  const { t } = useTranslation();
  // A minimal confirm dialog. If the project has a shared <ConfirmDialog>
  // primitive, swap to that; otherwise this inline modal is fine.
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="rounded bg-background p-4 shadow-lg">
        <p className="mb-3 text-sm">{t('membership.errors.lastOrgadmin')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('membership.add.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void onConfirm()}>
            {t('membership.remove.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Step 3: Barrel

`apps/frontend/src/features/org-membership-manager/index.ts`:

```ts
export { OrgMembershipManager, type OrgMembershipManagerProps } from './ui/OrgMembershipManager.js';
export { OrgMembershipEditor, type OrgMembershipEditorProps } from './ui/OrgMembershipEditor.js';
```

### Step 4: Tests

`OrgMembershipEditor.test.tsx` — 3 cases:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

import { OrgMembershipEditor } from './OrgMembershipEditor.js';
import i18n from '@/i18n';

// jsdom pointer-capture stubs — same as student-progress-editor-dialog
if (!('hasPointerCapture' in HTMLElement.prototype)) {
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
}

vi.mock('@/entities/user', () => ({
  listUsersQueryOptions: () => ({
    queryKey: ['users'],
    queryFn: () => Promise.resolve({ data: [{ id: 'u1', name: 'Alice', email: 'a@x' }] }),
  }),
}));

function wrap(node: React.ReactElement): React.ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <I18nextProvider i18n={i18n}><QueryClientProvider client={qc}>{node}</QueryClientProvider></I18nextProvider>;
}

describe('<OrgMembershipEditor>', () => {
  it('renders a user picker and the supplied roles', async () => {
    render(wrap(
      <OrgMembershipEditor
        open
        onOpenChange={vi.fn()}
        allowedRoles={['orgadmin', 'instructor']}
        onConfirm={vi.fn()}
      />,
    ));
    expect(await screen.findByText(/Alice/)).toBeInTheDocument();
    // Both roles are options.
    expect(screen.getByText(/orgadmin/i)).toBeInTheDocument();
    expect(screen.getByText(/instructor/i)).toBeInTheDocument();
  });

  it('hides the orgadmin role when only instructor is allowed', () => {
    render(wrap(
      <OrgMembershipEditor
        open
        onOpenChange={vi.fn()}
        allowedRoles={['instructor']}
        onConfirm={vi.fn()}
      />,
    ));
    expect(screen.queryByText(/orgadmin/i)).not.toBeInTheDocument();
  });

  it('blocks submit until a user is picked', async () => {
    const onConfirm = vi.fn();
    render(wrap(
      <OrgMembershipEditor
        open
        onOpenChange={vi.fn()}
        allowedRoles={['instructor']}
        onConfirm={onConfirm}
      />,
    ));
    fireEvent.click(screen.getByRole('button', { name: /add|save|submit/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

`OrgMembershipManager.test.tsx` — 4 cases (rows render, add button gated by ability, remove hidden on own orgadmin row, LAST_ORGADMIN triggers confirm modal). Use the same scaffolding + a stubbed ability context. For brevity in the plan, the test file follows the same patterns; see `apps/frontend/src/features/student-progress-editor-dialog/ui/StudentProgressEditorDialog.test.tsx` for the abilityContext stubbing pattern.

### Step 5: Run + typecheck

```bash
pnpm --filter frontend exec vitest run src/features/org-membership-manager
cd apps/frontend && npx tsc --noEmit
```

Expected: tests pass, typecheck clean.

### Step 6: Commit

```bash
git add apps/frontend/src/features/org-membership-manager/
git commit -m "feat(membership): OrgMembershipManager + OrgMembershipEditor (org-scope sysadmin/orgadmin)"
```

---

## Task 8: Frontend — mount the org-scope manager from `AdminOrganisationsPage`

**Files:**
- Modify: `apps/frontend/src/pages/admin-organisations/ui/AdminOrganisationsPage.tsx`
- Modify (or extend): `apps/frontend/src/pages/admin-organisations/ui/AdminOrganisationsPage.test.tsx` (or create if not present).

### Step 0: Recon

Open the existing page and find its row rendering — does each org row already have a click handler? If yes, augment it. If not, add `onClick` to open a Sheet with the manager. Look at `AdminUsersPage` for the state-machine pattern (`type PageMode`) as a model.

### Step 1: Add Sheet + selected-org state

In `AdminOrganisationsPage.tsx`:

```tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet.js';
import { OrgMembershipManager } from '@/features/org-membership-manager';

// inside the component:
const [membersFor, setMembersFor] = React.useState<{ id: string; label: string } | null>(null);

// in the row click handler:
onClick={() => setMembersFor({ id: org.id, label: pickName(org) })}

// at the bottom of the JSX:
<Sheet open={!!membersFor} onOpenChange={(open) => !open && setMembersFor(null)}>
  <SheetContent side="right" className="w-[480px] sm:max-w-md">
    {membersFor ? (
      <>
        <SheetHeader>
          <SheetTitle>{t('membership.org.title', { org: membersFor.label })}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <OrgMembershipManager organisationId={membersFor.id} orgLabel={membersFor.label} />
        </div>
      </>
    ) : null}
  </SheetContent>
</Sheet>
```

`pickName(org)` should reuse the project's existing org-display-name helper (`apps/frontend/src/entities/organisation/lib/displayName.ts`).

### Step 2: Test — row click opens the manager

In `AdminOrganisationsPage.test.tsx`, add or extend with:

```tsx
it('clicking an org row opens the membership manager sheet', async () => {
  render(wrap(<AdminOrganisationsPage />));
  fireEvent.click(await screen.findByText(/Stockholms Taidoförening/));
  expect(await screen.findByText(/Stockholms Taidoförening/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
});
```

Stub `useQuery(listOrganisationsQueryOptions)` and `useQuery(listMembershipsQueryOptions)` per the project's existing pattern.

### Step 3: Run + typecheck

```bash
pnpm --filter frontend exec vitest run src/pages/admin-organisations
cd apps/frontend && npx tsc --noEmit
```

### Step 4: Commit

```bash
git add apps/frontend/src/pages/admin-organisations/
git commit -m "feat(admin-organisations): row click opens OrgMembershipManager in Sheet"
```

---

## Task 9: Frontend — new `/my-organisation` page + route

**Files:**
- Create: `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.tsx`
- Create: `apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.test.tsx`
- Create: `apps/frontend/src/pages/my-organisation/index.ts`
- Create: `apps/frontend/src/app/router/routes/_app.my-organisation.tsx`
- Modify: `apps/frontend/src/app/router/routeTree.gen.ts` — hand-edit to register the new route (file has `@ts-nocheck`).

### Step 0: Recon

Read `apps/frontend/src/pages/students/ui/StudentsPage.tsx` (Phase 3.5) for the page + hook + state-empty pattern. Read an existing `_app.*.tsx` route file for the route declaration shape.

### Step 1: Page

```tsx
// apps/frontend/src/pages/my-organisation/ui/MyOrganisationPage.tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useMyMembershipsQuery } from '@/entities/me';
import { OrgMembershipManager } from '@/features/org-membership-manager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

/**
 * Shows the orgs the current user can orgadmin and mounts the
 * org-membership manager for the active org. Single-org case skips the tab
 * strip and mounts the manager directly.
 */
export function MyOrganisationPage(): React.ReactElement {
  const { t } = useTranslation();
  const { data: memberships = [] } = useMyMembershipsQuery();

  const orgadminOrgs = React.useMemo(
    () => memberships.filter((m) => m.role === 'orgadmin').map((m) => m.organisationId),
    [memberships],
  );

  const [activeOrgId, setActiveOrgId] = React.useState<string | null>(
    orgadminOrgs[0] ?? null,
  );
  React.useEffect(() => {
    if (!activeOrgId && orgadminOrgs[0]) setActiveOrgId(orgadminOrgs[0]);
  }, [orgadminOrgs, activeOrgId]);

  if (orgadminOrgs.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">{t('myOrganisation.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('myOrganisation.empty')}</p>
      </div>
    );
  }

  if (orgadminOrgs.length === 1) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">{t('myOrganisation.title')}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{t('myOrganisation.description')}</p>
        <OrgMembershipManager
          organisationId={orgadminOrgs[0]}
          orgLabel={orgadminOrgs[0]}  // TODO see Task 9 step 4 — replace with hydrated name
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-semibold">{t('myOrganisation.title')}</h1>
      <Tabs value={activeOrgId ?? orgadminOrgs[0]} onValueChange={setActiveOrgId}>
        <TabsList>
          {orgadminOrgs.map((id) => (
            <TabsTrigger key={id} value={id}>{id}</TabsTrigger>
          ))}
        </TabsList>
        {orgadminOrgs.map((id) => (
          <TabsContent key={id} value={id}>
            <OrgMembershipManager organisationId={id} orgLabel={id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

### Step 2: Replace org-id placeholders with display names

The above mounts `orgLabel={orgadminOrgs[0]}` (id). Replace with hydrated names by pulling the org list via `useQuery(listOrganisationsQueryOptions())` and indexing by id:

```tsx
import { useQuery } from '@tanstack/react-query';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import { pickOrganisationName } from '@/entities/organisation/lib/displayName.js';

const { data: orgListResp } = useQuery(listOrganisationsQueryOptions());
const orgIndex = React.useMemo(() => {
  const map = new Map<string, string>();
  (orgListResp?.data ?? []).forEach((o) => map.set(o.id, pickOrganisationName(o, i18n.language)));
  return map;
}, [orgListResp]);

// Use `orgIndex.get(id) ?? id` everywhere `orgLabel={…}` appears.
```

Adjust the `pickOrganisationName` import to match the project's actual export.

### Step 3: Route

```tsx
// apps/frontend/src/app/router/routes/_app.my-organisation.tsx
import { createRoute } from '@tanstack/react-router';

import { MyOrganisationPage } from '@/pages/my-organisation';
import { appLayoutRoute } from './_app.js';

export const myOrganisationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/my-organisation',
  component: MyOrganisationPage,
});

export const Route = myOrganisationRoute;
```

Match the project's route file convention — if it uses `createFileRoute`, switch to that.

### Step 4: Register in `routeTree.gen.ts`

Add an import + entry alongside the other `_app.*` routes. The file has `@ts-nocheck`. Mirror the Phase 3.5 students-route registration pattern.

### Step 5: Barrel

`apps/frontend/src/pages/my-organisation/index.ts`:

```ts
export { MyOrganisationPage } from './ui/MyOrganisationPage.js';
```

### Step 6: Tests

`MyOrganisationPage.test.tsx` — 3 cases:

```tsx
it('zero orgadmin orgs → friendly empty state', async () => {
  // mock useMyMembershipsQuery -> empty array
  render(wrap(<MyOrganisationPage />));
  expect(await screen.findByText(/no organisations|empty/i)).toBeInTheDocument();
});

it('one orgadmin org → mounts manager directly without tab strip', async () => {
  // mock useMyMembershipsQuery -> [{ organisationId: 'A', role: 'orgadmin' }]
  render(wrap(<MyOrganisationPage />));
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(await screen.findByText(/add/i)).toBeInTheDocument();
});

it('two orgadmin orgs → tab strip with one tab per org', async () => {
  // mock useMyMembershipsQuery -> [{A, orgadmin}, {B, orgadmin}]
  render(wrap(<MyOrganisationPage />));
  expect(await screen.findByRole('tablist')).toBeInTheDocument();
});
```

Use the same `vi.mock('@/entities/me', …)` pattern Phase 3.5 used.

### Step 7: Run + typecheck

```bash
pnpm --filter frontend exec vitest run src/pages/my-organisation
cd apps/frontend && npx tsc --noEmit
```

### Step 8: Commit

```bash
git add apps/frontend/src/pages/my-organisation/ \
        apps/frontend/src/app/router/routes/_app.my-organisation.tsx \
        apps/frontend/src/app/router/routeTree.gen.ts
git commit -m "feat(my-organisation): page + route for orgadmin membership management"
```

---

## Task 10: Frontend — sidebar entry for orgadmins

**Files:**
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx`

### Step 0: Recon

Read `AppSidebar.tsx` — find the existing "Students" entry (Phase 3.5) and how it gates by `isInstructor`. Mirror the pattern.

### Step 1: Add the entry

In `AppSidebar.tsx`:

```tsx
import { Building2 } from 'lucide-react';
// (alongside the existing imports)

// inside the component, near the existing isInstructor check:
const isOrgAdmin = memberships.some((m) => m.role === 'orgadmin');

// in the NAV rendering, after Students:
{isOrgAdmin ? (
  <SidebarMenuItem>
    <SidebarMenuButton asChild isActive={pathname.startsWith('/my-organisation')}>
      <Link to="/my-organisation">
        <Building2 />
        <span>{t('nav.myOrganisation')}</span>
      </Link>
    </SidebarMenuButton>
  </SidebarMenuItem>
) : null}
```

### Step 2: Test

Extend `AppSidebar.test.tsx`:

```tsx
it('shows "My organisation" only when user has an orgadmin membership', async () => {
  vi.mocked(useMyMembershipsQuery).mockReturnValue({
    data: [{ organisationId: 'A', role: 'orgadmin' }],
    isPending: false,
  } as any);
  render(wrap(<AppSidebar />));
  expect(await screen.findByText(/my organisation/i)).toBeInTheDocument();
});

it('hides "My organisation" for plain users', async () => {
  vi.mocked(useMyMembershipsQuery).mockReturnValue({ data: [], isPending: false } as any);
  render(wrap(<AppSidebar />));
  expect(screen.queryByText(/my organisation/i)).not.toBeInTheDocument();
});
```

### Step 3: Run + typecheck

```bash
pnpm --filter frontend exec vitest run src/widgets/appsidebar
cd apps/frontend && npx tsc --noEmit
```

### Step 4: Commit

```bash
git add apps/frontend/src/widgets/appsidebar/
git commit -m "feat(appsidebar): My organisation entry for orgadmins"
```

---

## Task 11: Frontend — `UserForm` last-orgadmin handling

**Files:**
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.tsx` (or the file in user-form that calls `useDeleteMembership`)
- Modify: the corresponding test.

### Step 0: Recon

```bash
grep -rn "useDeleteMembership" apps/frontend/src/features/user-form
```

Find where the user-form's Memberships tab calls `useDeleteMembership`. That site needs the same catch-`LAST_ORGADMIN`-and-confirm logic as `OrgMembershipManager` in Task 7.

### Step 1: Wrap the delete call

```tsx
import * as React from 'react';

// inside the component:
const [lastOrgadminConfirm, setLastOrgadminConfirm] = React.useState<{ id: string } | null>(null);
const removeMembership = useDeleteMembership();

async function handleRemoveMembership(id: string, confirmFlag = false): Promise<void> {
  try {
    await removeMembership.mutateAsync({ id, confirm: confirmFlag });
  } catch (err: unknown) {
    if (
      typeof err === 'object' && err !== null &&
      'status' in err && (err as { status: number }).status === 409 &&
      'body' in err &&
      (err as { body?: { error?: { code?: string } } }).body?.error?.code === 'LAST_ORGADMIN'
    ) {
      setLastOrgadminConfirm({ id });
      return;
    }
    throw err;
  }
}
```

Use `handleRemoveMembership(m.id)` everywhere the existing code called `removeMembership.mutate(m.id)`. Mount the confirm dialog (see Task 7 step 2's `ConfirmLastOrgadmin`).

If the dialog is duplicated across Task 7 and 11, extract it to `apps/frontend/src/features/org-membership-manager/ui/ConfirmLastOrgadminDialog.tsx` after both tasks ship — but only as a follow-up if both call sites end up nearly identical. Don't preemptively share.

### Step 2: Test — confirm path

Add to the existing user-form spec:

```tsx
it('catches LAST_ORGADMIN on delete and confirms before retrying', async () => {
  // First mutateAsync call rejects with 409 LAST_ORGADMIN.
  // Confirm-dialog OK calls mutateAsync again with { id, confirm: true }, succeeds.
  // Assertions:
  expect(mutateAsync).toHaveBeenNthCalledWith(1, { id: 'm-1' });
  expect(mutateAsync).toHaveBeenNthCalledWith(2, { id: 'm-1', confirm: true });
});
```

### Step 3: Run + typecheck

```bash
pnpm --filter frontend exec vitest run src/features/user-form
cd apps/frontend && npx tsc --noEmit
```

### Step 4: Commit

```bash
git add apps/frontend/src/features/user-form/
git commit -m "feat(user-form): catch LAST_ORGADMIN on membership delete + confirm flow"
```

---

## Task 12: i18n + full pipeline

**Files:**
- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

### Step 1: en.json

Add (merge into existing nested structure):

```json
"nav": { "myOrganisation": "My organisation" },
"membership": {
  "loading": "Loading…",
  "empty": "No memberships yet.",
  "columns": { "user": "User", "org": "Organisation", "role": "Role", "actions": "" },
  "role": { "orgadmin": "Orgadmin", "instructor": "Instructor" },
  "org": { "title": "Members of {{org}}" },
  "add": {
    "title": "Add membership",
    "userPicker": "User",
    "userPickerPlaceholder": "Search by name or email…",
    "userPickerSelect": "Select a user",
    "userPickerRequired": "Please pick a user.",
    "orgPicker": "Organisation",
    "rolePicker": "Role",
    "submit": "Add",
    "cancel": "Cancel"
  },
  "remove": {
    "label": "Remove",
    "confirm": "Remove this membership?"
  },
  "errors": {
    "forbidden": "You don't have permission to do that.",
    "conflict": "That user already has that role in that organisation.",
    "selfDemoteBlocked": "Orgadmins cannot remove their own orgadmin role.",
    "lastOrgadmin": "This is the last orgadmin in the organisation. Continue anyway?"
  }
},
"myOrganisation": {
  "title": "My organisation",
  "description": "Manage instructor memberships in your organisation(s).",
  "empty": "You are not an orgadmin in any organisation."
}
```

### Step 2: sv.json (Swedish)

```json
"nav": { "myOrganisation": "Min organisation" },
"membership": {
  "loading": "Laddar…",
  "empty": "Inga medlemskap ännu.",
  "columns": { "user": "Användare", "org": "Organisation", "role": "Roll", "actions": "" },
  "role": { "orgadmin": "Orgadmin", "instructor": "Instruktör" },
  "org": { "title": "Medlemmar i {{org}}" },
  "add": {
    "title": "Lägg till medlemskap",
    "userPicker": "Användare",
    "userPickerPlaceholder": "Sök på namn eller e-post…",
    "userPickerSelect": "Välj en användare",
    "userPickerRequired": "Välj en användare.",
    "orgPicker": "Organisation",
    "rolePicker": "Roll",
    "submit": "Lägg till",
    "cancel": "Avbryt"
  },
  "remove": { "label": "Ta bort", "confirm": "Ta bort detta medlemskap?" },
  "errors": {
    "forbidden": "Du har inte behörighet att göra det.",
    "conflict": "Användaren har redan den rollen i den organisationen.",
    "selfDemoteBlocked": "Orgadmins kan inte ta bort sin egen orgadmin-roll.",
    "lastOrgadmin": "Detta är den sista orgadmin i organisationen. Fortsätta ändå?"
  }
},
"myOrganisation": {
  "title": "Min organisation",
  "description": "Hantera instruktörsmedlemskap i din organisation.",
  "empty": "Du är inte orgadmin i någon organisation."
}
```

### Step 3: fi.json (Finnish)

```json
"nav": { "myOrganisation": "Oma organisaatio" },
"membership": {
  "loading": "Ladataan…",
  "empty": "Ei jäsenyyksiä vielä.",
  "columns": { "user": "Käyttäjä", "org": "Organisaatio", "role": "Rooli", "actions": "" },
  "role": { "orgadmin": "Orgadmin", "instructor": "Ohjaaja" },
  "org": { "title": "Organisaation {{org}} jäsenet" },
  "add": {
    "title": "Lisää jäsenyys",
    "userPicker": "Käyttäjä",
    "userPickerPlaceholder": "Hae nimellä tai sähköpostilla…",
    "userPickerSelect": "Valitse käyttäjä",
    "userPickerRequired": "Valitse käyttäjä.",
    "orgPicker": "Organisaatio",
    "rolePicker": "Rooli",
    "submit": "Lisää",
    "cancel": "Peruuta"
  },
  "remove": { "label": "Poista", "confirm": "Poistetaanko tämä jäsenyys?" },
  "errors": {
    "forbidden": "Sinulla ei ole oikeutta tähän.",
    "conflict": "Käyttäjällä on jo tämä rooli kyseisessä organisaatiossa.",
    "selfDemoteBlocked": "Orgadminit eivät voi poistaa omaa orgadmin-rooliaan.",
    "lastOrgadmin": "Tämä on organisaation viimeinen orgadmin. Jatketaanko silti?"
  }
},
"myOrganisation": {
  "title": "Oma organisaatio",
  "description": "Hallinnoi ohjaajajäsenyyksiä organisaatiossasi.",
  "empty": "Et ole orgadmin missään organisaatiossa."
}
```

### Step 4: Full pipeline

```bash
pnpm --filter @repo/contracts exec vitest run
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
pnpm --filter frontend exec vitest run
cd apps/frontend && npx tsc --noEmit
pnpm --filter frontend run arch  # FSD lint, if present
```

Expected:
- Contracts: 173/173 (no change in tests).
- Backend: ~365/365 (357 + ~8 new across Tasks 1–3).
- Frontend: ~340/340 (322 + ~18 new across Tasks 6–11).
- All typechecks clean.

If any of the documented frontend flakes hit (Phase 1+2 `profile-form`, `organisation-form` under parallel load), rerun in isolation.

### Step 5: Confirm clean tree

```bash
git status
```

Expected: clean except for any pre-existing untouched dirty files outside this plan's scope.

### Step 6: Commit

```bash
git add apps/frontend/src/i18n/locales/
git commit -m "feat(i18n): membership + myOrganisation keys (en/sv/fi)"
```

---

## Self-Review Notes

**Spec coverage check (against `2026-06-13-org-membership-management-design.md`):**

| Spec section | Task(s) |
|---|---|
| §4 authorization model — sysadmin all, orgadmin instructor-only-in-own-orgs, no orgadmin update | Task 1 |
| §5.1 CASL widening | Task 1 |
| §5.2 list-scope widening | Task 2 |
| §5.3 self-demote + last-orgadmin guards | Task 3 + Task 7 (FE confirm) + Task 11 (FE confirm in user-form) |
| §5.4 confirm query | Task 4 |
| §6 contracts confirm + OpenAPI regen | Task 5 |
| §7.1 entities/membership — already exists; thread `confirm` | Task 6 |
| §7.2 features/membership-manager → reality: build only the org-scope variant; user-scope already exists as MembershipEditor | Task 7 |
| §7.3 admin-organisations integration | Task 8 |
| §7.3 admin-users integration → already exists; only the confirm flow needs adding | Task 11 |
| §7.4 /my-organisation page | Task 9 |
| §7.5 sidebar entry | Task 10 |
| §7.6 i18n keys | Task 12 |
| §10 edge cases | covered by guards + confirm flow + UI gating across Tasks 1–11 |
| §11 testing | counts distributed across each task |

**Placeholder scan:** one explicit `// TODO see Task 9 step 4` placeholder in the page code — that step *is* the resolution, so it's intentional rather than a deferred TODO. No `TBD` or `add appropriate error handling` patterns remain.

**Type consistency:**
- `MembershipRole` everywhere is imported from `@/entities/membership` (the existing alias).
- `OrganisationMembership` instance objects always have `{ __caslSubjectType__: 'OrganisationMembership' as const, organisationId, role }` — same shape across Tasks 1, 7.
- `DeleteMembershipVariables` shape is `{ id; confirm? }` consistently across Tasks 6, 7, 11.
- Backend `delete(id, actor, opts?)` and frontend `deleteMembership(id, options?)` signatures match.

**Net commit count:** 12 (one per task).

Total task count: 12.
