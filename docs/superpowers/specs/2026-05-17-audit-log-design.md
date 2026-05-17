# Audit Log — Design

**Status:** Approved (data model, backend, frontend sections confirmed by stakeholder on 2026-05-17)
**Author:** Claude (brainstormed with stefanag)
**Spec date:** 2026-05-17

## Goal

Give sysadmins a tamper-evident, structured record of every admin-gated
mutation in the system. The infrastructure is entity-agnostic so the
moment a second admin module lands (Users, etc.) it opts in by calling
one helper. The store is rich enough to power state recovery (pairs
naturally with the deferred soft-delete follow-up).

## Scope (v1)

In scope:

- New `audit_log` Postgres table + Drizzle schema.
- New `audit-log` backend module: service (write + read), repository,
  controller, abilities, DTOs.
- Wire `OrganisationsService`'s `create / update / delete` to emit
  audit rows transactionally.
- One read endpoint `GET /api/admin/audit-log` (paginated, filterable).
- Dedicated admin page `/admin/audit-log`.
- Per-entity "Activity" tab on the organisation edit dialog.
- i18n (en/sv/fi) for everything new.

Explicitly out of scope for v1 (tracked in `docs/followups.md`):

- Hydrating the "Who" column from the users table (v1 shows the raw
  user id). Saves a join in the list endpoint and a query in the
  frontend; trivial to add later when users are admin-managed.
- CSV export of audit rows.
- Saved filter presets.
- Side-by-side diff viewer with semantic colouring; v1 uses a plain
  JSON view with key-level highlighting.

## Data model

New Drizzle table `audit_log` in
`apps/backend/src/infrastructure/database/schema/audit-log.ts`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK defaultRandom | |
| `entity_type` | `text` | NOT NULL | Lowercase singular: `'organisation'`, `'user'`, … |
| `entity_id` | `text` | NOT NULL | Text not uuid — entity ids vary across modules (uuid for organisations, text for users) |
| `action` | `text` | NOT NULL, CHECK in `('create','update','delete','move')` | |
| `user_id` | `text` | FK → `user(id)` ON DELETE SET NULL, nullable | Preserves history when accounts are deleted |
| `before` | `jsonb` | nullable | NULL on `create` |
| `after` | `jsonb` | nullable | NULL on `delete` |
| `created_at` | `timestamptz` | NOT NULL defaultNow | Insertion time; rows are immutable |

Indexes:

- `(entity_type, entity_id, created_at DESC)` — covers per-entity
  activity tabs.
- `(user_id, created_at DESC)` — covers "what has this admin done"
  queries.
- `(created_at DESC)` — covers the unfiltered dedicated page sort.

No application-level update or delete: rows are append-only. Database
permissions could enforce this later; v1 just relies on the absence of
update/delete methods in the repository.

### Action semantics

- `create`: `before = null`, `after = full row`.
- `update`: `before = previous row`, `after = updated row`. Used for
  every change that isn't a pure reparent.
- `move`: same payload as `update`, but emitted when the **only**
  changed field is `parent_id`. Special-cased because reparenting is
  conceptually distinct in the org admin UX (separate "Move" dialog).
- `delete`: `before = full row`, `after = null`.

## Backend module

Layout under `apps/backend/src/modules/audit-log/`:

```
audit-log.module.ts          // @Global so any service can inject AuditLogService
audit-log.controller.ts      // GET /api/admin/audit-log
audit-log.service.ts         // record(tx, ...) + list(query, user)
audit-log.repository.ts      // Drizzle queries
audit-log.abilities.ts       // admin → can('read', 'AuditLog')
dto/
  audit-log-entry.dto.ts
  list-audit-log-query.dto.ts
  list-audit-log-response.dto.ts
```

### HTTP routes

All under `/api/admin/audit-log`. Admin-only via
`@CheckAbility('read', 'AuditLog')`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/audit-log` | Paginated list, latest first. Optional filters: `?entityType=`, `?entityId=`, `?userId=`, `?action=`, `?from=` / `?to=` (ISO datetimes), `?page=` (default 1), `?perPage=` (default 25, max 100). |

One endpoint covers both the dedicated page (no entity filter) and the
per-entity activity tab (`entityType=organisation&entityId=<id>`).

### Authorization (CASL)

Add `'AuditLog'` to `SubjectSchema` in `packages/contracts/src/casl.ts`
alongside `'User'` / `'Organisation'`. Define
`AuditLogSubjectShape = { __caslSubjectType__: 'AuditLog'; id?: string }`
and add it to `AppSubject`.

```ts
// audit-log.abilities.ts
if (user?.role === 'admin') builder.can('read', 'AuditLog');
```

Wire `AuditLogAbilityRules` into `AbilityModule` and inject it into
`AbilityFactory` alongside the other rule contributors.

### Contracts

Add `packages/contracts/src/audit-log.ts`:

- `AuditLogActionSchema` — Zod enum `'create' | 'update' | 'delete' | 'move'`.
- `AuditLogEntrySchema` — full row (id, entityType, entityId, action,
  userId nullable, before/after as `z.unknown().nullable()`, createdAt
  ISO string).
- `ListAuditLogQuerySchema` — `entityType?`, `entityId?`, `userId?`,
  `action?`, `from?`, `to?`, `page = 1`, `perPage = 25 (max 100)`.
- `ListAuditLogResponseSchema` — `{ data, total, page, perPage }`.

Add `AuditLogRoutes = { base: '/api/admin/audit-log' }` to `routes.ts`.

Re-export via `@repo/contracts/audit-log`, register in `tsup.config.ts`
+ `package.json` exports + `index.ts` barrel + `openapi.ts` registry.

### Write integration

`AuditLogModule` is `@Global()` so consumers don't have to import it
explicitly. `AuditLogService.record(input)` is the only write surface:

```ts
class AuditLogService {
  record(input: {
    tx: DrizzleDb;
    entityType: string;
    entityId: string;
    action: 'create' | 'update' | 'delete' | 'move';
    userId: string | null;
    before: unknown | null;
    after: unknown | null;
  }): Promise<void>;
}
```

The `tx` parameter is the Drizzle transaction the caller is running in.
The audit insert happens inside that transaction → either the operation
+ audit row both commit, or both roll back. No silent audit loss.

**Repository changes**: `OrganisationsRepository.create / update /
delete` get an optional `tx?: DrizzleDb` parameter. When provided, the
method uses `tx` instead of `this.db`.

**Service changes**: `OrganisationsService` constructor gains
`@Inject(DRIZZLE) db: DrizzleDb` and `audit: AuditLogService`. Each
mutation method wraps its work in `this.db.transaction(async (tx) =>
{ ... })`:

```ts
async create(input, user) {
  this.assertCan(user, 'create');
  await this.validateHierarchy(input.type, input.parentId);
  return this.db.transaction(async (tx) => {
    const row = await this.repo.create(input, tx);
    const after = this.toApi(row);
    await this.audit.record({
      tx,
      entityType: 'organisation',
      entityId: row.id,
      action: 'create',
      userId: user.id,
      before: null,
      after,
    });
    return after;
  });
}

async update(id, input, user) {
  this.assertCan(user, 'update');
  const existing = await this.requireById(id);
  if (input.parentId !== undefined) {
    await this.validateHierarchy(existing.type, input.parentId);
    if (input.parentId !== null) await this.assertNoCycle(id, input.parentId);
  }
  return this.db.transaction(async (tx) => {
    const row = await this.repo.update(id, input, tx);
    if (!row) throw new NotFoundException(this.notFound(id));
    const before = this.toApi(existing);
    const after = this.toApi(row);
    // Detect a pure reparent — same fields touched on input AND a real change.
    const isOnlyParentChange =
      Object.keys(input).length === 1 &&
      'parentId' in input &&
      input.parentId !== existing.parentId;
    await this.audit.record({
      tx,
      entityType: 'organisation',
      entityId: row.id,
      action: isOnlyParentChange ? 'move' : 'update',
      userId: user.id,
      before,
      after,
    });
    return after;
  });
}

async delete(id, user) {
  this.assertCan(user, 'delete');
  const existing = await this.requireById(id);
  const childCount = await this.repo.countChildren(id);
  if (childCount > 0) {
    throw new ConflictException({
      error: { code: 'HAS_CHILDREN', message: `Organisation ${id} still has ${childCount} child(ren).` },
    });
  }
  await this.db.transaction(async (tx) => {
    await this.repo.delete(id, tx);
    await this.audit.record({
      tx,
      entityType: 'organisation',
      entityId: id,
      action: 'delete',
      userId: user.id,
      before: this.toApi(existing),
      after: null,
    });
  });
}
```

### Tests

- `audit-log.service.spec.ts` — `record()` inserts via `tx`; `list()`
  filters + paginates.
- `audit-log.controller.spec.ts` — 401/403/200 path matrix.
- Update `organisations.service.spec.ts` — assert each mutation calls
  `AuditLogService.record` with the expected shape (mock the service).
- Add: a transactional integration test for `OrganisationsService.create`
  that asserts a rollback rolls back the audit row too. (Uses
  `app-factory.ts` + a real test DB.)

## Frontend

### Layers

```
entities/audit-log/
  api/audit-log.api.ts             // listAuditLog(query) — wraps httpClient
  model/audit-log.queries.ts       // auditLogKeys + listAuditLogQueryOptions
  lib/diffFields.ts                // before/after → field-level diff (created/changed/removed)
  index.ts
widgets/
  audit-log-filters/
    ui/AuditLogFilters.tsx         // entity type / user / action / date range; emits a query
  audit-log-table/
    ui/AuditLogTable.tsx           // paginated table; takes a `query` prop so it's reusable
pages/
  admin-audit-log/
    ui/AdminAuditLogPage.tsx       // composes filters + table; defaults to latest 25
    ui/AdminAuditLogPage.stories.tsx
```

Route: `apps/frontend/src/app/router/routes/_app.admin.audit-log.tsx` —
nested under the `_app` auth gate with the same admin-role redirect as
`_app.admin.organisations.tsx`.

### Table rows

Columns: `When | Who | Entity | Action | Diff`.

- **When**: localized timestamp (`createdAt`).
- **Who**: user id (v1 — see "Out of scope"). Use a `<code>` for the
  text so monospace makes truncation obvious.
- **Entity**: `entityType: entityId` (`<code>`).
- **Action**: localized verb (`actions.created`, `actions.updated`,
  `actions.moved`, `actions.deleted`).
- **Diff**: compact summary computed from `before`/`after` via
  `diffFields` — e.g. `+1 / ~3 / -0` for create/changed/removed fields.

Each row expands on click to show two-column side-by-side `<pre>` blocks
for `before` (null on create) and `after` (null on delete). No external
JSON-diff library; just simple text rendering with the changed keys
highlighted by a CSS class (yellow background).

### Per-entity activity tab

Wrap the existing `OrganisationForm` body in shadcn `<Tabs>` when
`mode === 'edit'`:

- `Details` tab: existing form.
- `Activity` tab: `<AuditLogTable query={{ entityType: 'organisation',
  entityId: org.id }} />`.

`mode === 'create'` keeps the form un-tabbed (no entity → no history).

### AppSidebar

Extend the existing Admin nav group with a second entry:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild isActive={pathname.startsWith('/admin/audit-log')}>
    <Link to="/admin/audit-log">
      <History />
      <span>{t('nav.adminAuditLog')}</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

`History` icon from `lucide-react`.

### i18n

New keys under `admin.auditLog.*` in en/sv/fi:

- `title`, `empty`
- `nav.adminAuditLog`
- `actions.{created,updated,deleted,moved}` — verb form
- `filters.{entityType,userId,action,from,to,clear}`
- `entityTypes.{organisation,user}` — translated singular noun
- `columns.{when,who,entity,action,diff}`
- `tabs.{details,activity}` (for the org form tabs)
- `diff.{created,changed,removed}` (for the compact summary)

### Tests

- `entities/audit-log/lib/diffFields.test.ts` — unit:
  - create-only (`before = null` → all fields counted as "created")
  - delete-only (`after = null` → all fields counted as "removed")
  - partial update (changed vs unchanged keys)
- `widgets/audit-log-table/ui/AuditLogTable.test.tsx` — renders rows,
  expand/collapse works, empty state shows.
- `widgets/audit-log-filters/ui/AuditLogFilters.test.tsx` — emits the
  right query on field changes.
- Extend `widgets/appsidebar/ui/AppSidebar.test.tsx` — assert "Audit
  log" admin link is visible for `role === 'admin'`, absent otherwise.

## Migration

A single Drizzle migration creates the `audit_log` table and indexes.
Old organisations rows have no audit history (the table starts empty);
audit entries only exist for changes that happen after this lands. This
is acceptable for v1.
