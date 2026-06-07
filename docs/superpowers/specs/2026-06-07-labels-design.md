# Labels — Tags + Categories Subsystem (Design Spec)

**Status:** approved (brainstorm), pending review
**Date:** 2026-06-07
**Phase A scope:** subsystem + Organisations integration as the demo
**Phase B (out of scope for this spec):** Users and Rank-history integration — each will be its own follow-up spec/plan.

## 1. Goals

Add a reusable labelling system to taidohub:

1. **Tags** — flat labels (no hierarchy) attachable to any entity type.
2. **Categories** — labels with one-level parent/child hierarchy, attachable to any entity type.
3. **Per-organisation visibility.** A label created by a member of Org A is visible to all Org A members. A sysadmin can additionally create globally-visible labels.
4. **CRUD by any authenticated user** on labels they author.
5. **Sysadmin-owned labels are read-and-use, not edit** — non-sysadmins can attach them but cannot modify or delete them.
6. **Filter and (loosely) sort** entity lists by attached labels.

## 2. Non-goals

- Multi-OR filter semantics (`?tag.any=a,b`). Phase A is AND-only.
- Re-parenting an existing category (move it to a different parent). Implemented by delete + create.
- Bulk import / CSV of labels.
- Search across label names beyond what the admin UI's combobox does.
- A "favourite" or "pinned" labels concept.
- Audit-log entries as a taggable type (queried by actor/action, not by user-defined labels).

## 3. Vocabulary

- **Label** — the umbrella term, used in UI copy and the URL `/settings/labels`. In code and DB, **tag** and **category** are separate concepts with separate tables and contracts. There is no `label` row type.
- **Target** / **taggable** — the entity an attachment points at (a user, an organisation, a rank-history entry).
- **Global label** — `organisation_id = NULL`. Visible to every authenticated user. Only sysadmins can create or modify.
- **Org-scoped label** — `organisation_id = <uuid>`. Visible to members of that organisation.

## 4. Data model

Four new tables. Migration is `0013` (next after the aboutMe migration 0012).

### 4.1 `tag`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `organisation_id` | `uuid` NULL FK `organisation(id)` `ON DELETE CASCADE` | NULL = sysadmin-owned global |
| `name` | `varchar(80)` NOT NULL | trimmed, non-empty |
| `created_by_user_id` | `text` NULL FK `"user"(id)` `ON DELETE SET NULL` | better-auth user IDs are text; NULL after the original author is deleted (see §12) |
| `created_at` | `timestamptz` NOT NULL default `now()` | |
| `updated_at` | `timestamptz` NOT NULL default `now()` | bump on each UPDATE |

Uniqueness: `UNIQUE (organisation_id, name) NULLS NOT DISTINCT` — two tags with the same name in the same org (or two globals with the same name) are rejected. Postgres 15+ `NULLS NOT DISTINCT` handles the NULL org case in one index. The Supabase pooler runs PG 15+, so this is available.

### 4.2 `category`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `organisation_id` | `uuid` NULL FK `organisation(id)` `ON DELETE CASCADE` | NULL = sysadmin-owned global |
| `parent_id` | `uuid` NULL FK `category(id)` `ON DELETE CASCADE` | NULL = root |
| `name` | `varchar(80)` NOT NULL | |
| `created_by_user_id` | `text` NULL FK `"user"(id)` `ON DELETE SET NULL` | nullable, same reason as Tag |
| `created_at` | `timestamptz` NOT NULL default `now()` | |
| `updated_at` | `timestamptz` NOT NULL default `now()` | |

Uniqueness: `UNIQUE (organisation_id, parent_id, name) NULLS NOT DISTINCT`.

**Tree depth invariant.** A row with non-null `parent_id` cannot itself be a parent. Enforced at the service layer in `CategoryService.create` and `update`: a create with `parentId` set must verify `parent.parent_id IS NULL`. We deliberately do *not* add a Postgres trigger here — the service is the only writer, and a trigger adds migration complexity disproportionate to the protection it adds. If the constraint is ever reached from a non-service writer (manual SQL, future bulk import), we will revisit and add the trigger.

**No re-parenting.** `UpdateCategorySchema` only allows `name` changes. Move = delete + recreate.

### 4.3 `tag_attachment`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `tag_id` | `uuid` NOT NULL FK `tag(id)` `ON DELETE CASCADE` | |
| `target_type` | `text` NOT NULL CHECK in `('user','organisation','rank_history')` | |
| `target_id` | `text` NOT NULL | text accommodates both UUIDs (org, rank-history) and text user IDs |
| `attached_by_user_id` | `text` NOT NULL FK `"user"(id)` | |
| `attached_at` | `timestamptz` NOT NULL default `now()` | |

Indexes:
- `UNIQUE (tag_id, target_type, target_id)` — one tag per target, idempotent attach.
- `(target_type, target_id)` — reverse lookup "what's attached to this object".

`ON DELETE CASCADE` on `tag_id` covers tag-side cleanup. Target-side cleanup (delete an org → remove its attachments) is the **service-layer hook** — there's no DB FK to attach a cascade to, since `target_id` is polymorphic. Each module gets a one-line cleanup call in its delete path: `LabelsService.detachAllForTarget('organisation', orgId)`.

### 4.4 `category_attachment`

Structurally identical to `tag_attachment`, replacing `tag_id` with `category_id`. Same indexes, same cascade rules.

### 4.5 Why per-row polymorphism over per-entity join tables

Two viable shapes:

- **A (chosen):** one `*_attachment` table per association type, polymorphic via `(target_type, target_id)`.
- **B (rejected):** per-entity join tables (`user_tag`, `organisation_tag`, `rank_history_tag`, + same trio for categories).

B has native FK enforcement on the target column. A doesn't — the app must validate `target_id` against the right table. We accept that cost because:

- The repo already does cross-row validation at the service layer (org membership, ownership checks, the CASL `contributors` pattern). One more validation is consistent with the existing style.
- B requires a migration every time a new entity becomes taggable. A requires zero schema change — just register the new `target_type` value.
- The query patterns we care about (reverse lookup by target, filter list by attached tags) work equally well on A with the composite index.

## 5. Contracts (`@repo/contracts/labels`)

New module: `packages/contracts/src/labels.ts`. Re-exported via the package root.

```ts
import { z } from 'zod';

export const TaggableTypeSchema = z.enum(['user', 'organisation', 'rank_history']);
export type TaggableType = z.infer<typeof TaggableTypeSchema>;

// ── Tag ──────────────────────────────────────────────────────────────────
export const TagSchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid().nullable(),
  name: z.string().min(1).max(80),
  createdByUserId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'Tag', description: 'A flat label attachable to any taggable entity.' });

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  /** Sysadmin-only when true; defaults to the user's organisation otherwise. */
  global: z.boolean().default(false),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(80).trim(),
});

// ── Category ─────────────────────────────────────────────────────────────
export const CategorySchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid().nullable(),
  parentId: z.uuid().nullable(),
  name: z.string().min(1).max(80),
  createdByUserId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'Category', description: 'A label with one-level parent/child hierarchy.' });

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(80).trim(),
  parentId: z.uuid().nullable().default(null),
  global: z.boolean().default(false),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(80).trim(),
});

// ── Attachments ──────────────────────────────────────────────────────────
export const TagAttachmentSchema = z.object({
  id: z.uuid(),
  tagId: z.uuid(),
  targetType: TaggableTypeSchema,
  targetId: z.string(),
  attachedByUserId: z.string(),
  attachedAt: z.iso.datetime(),
}).meta({ id: 'TagAttachment' });

export const CategoryAttachmentSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  targetType: TaggableTypeSchema,
  targetId: z.string(),
  attachedByUserId: z.string(),
  attachedAt: z.iso.datetime(),
}).meta({ id: 'CategoryAttachment' });

export const CreateTagAttachmentSchema = z.object({
  tagId: z.uuid(),
  targetType: TaggableTypeSchema,
  targetId: z.string(),
});

export const CreateCategoryAttachmentSchema = z.object({
  categoryId: z.uuid(),
  targetType: TaggableTypeSchema,
  targetId: z.string(),
});

// ── Per-module list-query extension ──────────────────────────────────────
/** Mixed into each integrated module's list-query schema. */
export const LabelFilterSchema = z.object({
  tag: z.array(z.uuid()).optional(),
  category: z.array(z.uuid()).optional(),
});
```

## 6. CASL permissions

New rule contributor: `apps/backend/src/modules/labels/labels.ability-rules.ts`. Registered in `AbilityFactory.contributors` via `@Optional()` injection (same pattern as the recent BeltCatalog/RankHistory fix).

| Subject | Action | Sysadmin | Member of label's org | Member of other org |
|---|---|:---:|:---:|:---:|
| `Tag` | read (own org) | ✓ | ✓ | ✗ |
| `Tag` | read (global, sysadmin-owned) | ✓ | ✓ | ✓ |
| `Tag` | create (org-scoped) | ✓ | ✓ | ✗ |
| `Tag` | create (global, `global=true`) | ✓ | ✗ | ✗ |
| `Tag` | update (own-authored) | ✓ | ✓ | ✗ |
| `Tag` | update (sysadmin-owned global) | ✓ | ✗ | ✗ |
| `Tag` | delete | (same as update) | (same as update) | (same as update) |
| `Category` | (all) | (same shape as Tag) | | |
| `TagAttachment` | create | ✓ | ✓ (needs `manage` on target) | ✓ (needs `manage` on target) |
| `TagAttachment` | delete | ✓ | self-authored, or `manage` on target | self-authored, or `manage` on target |
| `CategoryAttachment` | (same shape as TagAttachment) | | | |

Permission to attach a label to a target delegates to the **target's** CASL subject. If you can `manage` (or `update`) the Organisation, you can label it. The labels module does not duplicate per-target ownership logic.

`AppSubjectName` in `@repo/contracts/casl` gains: `'Tag'`, `'Category'`, `'TagAttachment'`, `'CategoryAttachment'`.

## 7. REST API

Single new controller, mounted at `/api/labels/*`.

```
GET    /api/labels/tags                                ← visible to me (own org + globals)
POST   /api/labels/tags                                ← CreateTagSchema
PATCH  /api/labels/tags/:id                            ← UpdateTagSchema
DELETE /api/labels/tags/:id                            ← cascades attachments

GET    /api/labels/categories                          ← visible to me; includes parent + children
POST   /api/labels/categories                          ← CreateCategorySchema
PATCH  /api/labels/categories/:id                      ← UpdateCategorySchema (name only)
DELETE /api/labels/categories/:id                      ← cascades children + their attachments

POST   /api/labels/tag-attachments                     ← CreateTagAttachmentSchema
DELETE /api/labels/tag-attachments/:id                 ← detach
GET    /api/labels/tag-attachments?targetType=&targetId=   ← what's attached to one target

POST   /api/labels/category-attachments                ← same shape
DELETE /api/labels/category-attachments/:id
GET    /api/labels/category-attachments?targetType=&targetId=
```

All endpoints use the existing `ZodValidationPipe` + CASL `@Subject()` decorators.

### 7.1 Filter param propagation into existing modules (Organisations demo)

`OrganisationsController.list` query schema mixes in `LabelFilterSchema`. The service builds the WHERE clause:

```ts
// pseudocode
if (filter.tag?.length) {
  qb.where(/* organisation.id IN (SELECT ta.target_id FROM tag_attachment ta WHERE ta.target_type='organisation' AND ta.tag_id IN (filter.tag)) */)
  // multi-tag AND: one such sub-clause per tag id, joined with AND
}
if (filter.category?.length) {
  // same shape, but expand each category to itself + its direct children before the IN clause
  // (descendant matching is one level — children only, no recursive CTE needed)
}
```

Sort by label name (`?sort=tag.name`) is implemented as a LEFT JOIN to the first matching attachment + that tag's name. Used for grouping; not a critical-path feature.

## 8. Cascade and lifecycle

| Trigger | Effect |
|---|---|
| Delete a tag | `ON DELETE CASCADE` removes its attachments. |
| Delete a category | `ON DELETE CASCADE` removes children + their attachments + own attachments. |
| Delete an organisation | Service-layer hook `LabelsService.detachAllForTarget('organisation', id)` runs before the org row is removed. |
| Delete a user | Same hook for `'user'`. Also: labels they authored are reassigned to NULL `created_by_user_id`? — see open considerations. |
| Delete a rank-history entry | Same hook for `'rank_history'`. |

Cascade warnings in admin UI:
- Deleting a sysadmin-owned global label: confirm dialog reads "Attached to N objects across all organisations. Continue?"
- Deleting an org-scoped label: confirm dialog reads "Attached to N objects in your organisation. Continue?"
- Deleting a category with children: "Will also delete N subcategories and their attachments."

## 9. Admin UI

### 9.1 `/settings/labels`

New route under the existing `/settings` stub. Two tabs: **Tags** | **Categories**.

```
Settings ▸ Labels
┌─ Tags ───────────────────────────────┐
│  [+ Add tag ____________ ] Save      │
│                                      │
│  Org-scoped (3)                      │
│   • competition-team       ✎  🗑     │
│   • instructor-candidate   ✎  🗑     │
│   • alumnus                ✎  🗑     │
│                                      │
│  Global (sysadmin) (2)               │
│   • founding-member        (read-only)│
│   • honorary               (read-only)│
└──────────────────────────────────────┘
```

For the Categories tab, top-level rows have a chevron to expand children and an "Add subcategory" affordance. Children rows have no "Add subcategory" affordance (enforces "one level deep" in the UI as well).

Sysadmin sees an extra "Global label" checkbox in the inline create form.

### 9.2 Filter UI on Organisations list (demo integration)

Above the existing `/admin/organisations` table:

```
┌───────────────────────────────────────────────────────┐
│ Filter:  [Tag ▾] [+]   [Category ▾] [+]               │
│ Active:  ╳ competition-team   ╳ Region › Stockholm    │
└───────────────────────────────────────────────────────┘
```

Comboboxes are debounced server-side typeahead against the labels GET endpoint. Selected labels persist in the URL as `?tag=<uuid>` / `?category=<uuid>` so the filter survives reload and is shareable.

### 9.3 Org detail page — Labels section

In the existing org detail UI, add a section:

```
Labels
  Tags:        [competition-team ✕]  [+ add tag ▾]
  Categories:  [Region › Stockholm ✕]  [+ add category ▾]
```

Combobox attach: typeahead against visible labels, click attaches. Detach: click ✕ on the chip.

## 10. i18n keys

`settings.labels.title`, `settings.labels.tagsTab`, `settings.labels.categoriesTab`, `settings.labels.addTag`, `settings.labels.addCategory`, `settings.labels.addSubcategory`, `settings.labels.global`, `settings.labels.orgScoped`, `settings.labels.readOnly`, `settings.labels.deleteConfirm`, `settings.labels.deleteWithAttachments`, `settings.labels.deleteWithChildren`, `labels.filter.tag`, `labels.filter.category`, `labels.attach.tag`, `labels.attach.category`, `labels.detach`. All three locales (en/sv/fi).

## 11. Testing strategy

| Layer | What to test |
|---|---|
| Contracts | Name min/max/trim. `global=true` requires sysadmin (server-enforced — contracts allow it). `parentId` ignored on update. |
| DB | Migration is purely additive. `NULLS NOT DISTINCT` uniqueness rejects duplicates including across NULL org rows. |
| Service: `LabelsService` (tag methods) | Create org-scoped vs global (with role check). Update is no-op on sysadmin-owned for regular users (returns ForbiddenError before DB). Delete cascades attachments. |
| Service: `LabelsService` (category methods) | Same as Tag plus: create with `parentId` rejects if parent already has a parent (depth invariant). Delete cascades children. |
| Service: `LabelsService` (attachment methods) | Validate `targetId` exists in the right table for `targetType`. Idempotent attach (duplicate is a no-op, not an error). Detach by attachment id; also `detachAllForTarget(type, id)` helper consumed by other modules. |
| `LabelsAbilityRules` | Sysadmin gets manage. User gets read on own-org + globals; create org-scoped only; update/delete own-authored only. |
| Controller | Each endpoint's CASL guard fires. ZodValidationPipe rejects bad input. |
| Frontend admin UI | List shows own-org + globals; globals are read-only for non-sysadmins. Inline create. Inline edit + save. Delete with cascade-count confirm. Categories tab: nested rendering, "Add subcategory" only on top-level. |
| Frontend Organisations filter | URL params drive the active filter chips. Multi-tag AND works (filter chip per tag = intersection). Category filter with a parent matches children too. |
| Frontend Organisation detail | Attach via combobox, detach via ✕, optimistic update with rollback on error. |

## 12. Open considerations / follow-ups

- **Author reassignment on user delete.** When a user is deleted, their authored labels could (a) be deleted, (b) get `created_by_user_id` set to NULL (label survives, attribution lost), or (c) be reassigned to a system user. Phase A: option (b) — set NULL, label survives. The `created_by_user_id` column becomes `text NULL`, and the FK is `ON DELETE SET NULL`.
- **Org change for a member.** If a user changes organisations, their labels stay with the *original* org (where they were authored). Their *attachments* on objects in the new org survive too (the attachment is the target's, not the attacher's). Worth a sanity check in the implementation.
- **Read-only counts.** Showing "Attached to N objects" in the admin UI requires a count query per row. Acceptable for small N (≤ a few hundred rows). If the labels list grows large, this becomes lazy-loaded.
- **No bulk attach.** Single-attachment endpoints only. Bulk operations (e.g. "attach this tag to all 12 selected orgs") deferred.

## 13. Task decomposition estimate

Phase A breaks into roughly:

1. Contracts: schemas + filter mixin + CASL subject names.
2. DB: tags + categories + 2 attachment tables + migration 0013 + Drizzle wiring.
3. Backend: `LabelsModule` (services, controller, ability rules) + AbilityFactory wiring.
4. Backend: `OrganisationsModule` integration — list filter + detach-all-for-target hook.
5. OpenAPI regen.
6. Frontend entities: `entities/labels/` (typed API client).
7. Frontend admin: `/settings/labels` route + page + tag tab + category tab.
8. Frontend filter widget: `features/labels-filter/`.
9. Frontend attach widget: `features/labels-attach/` (combobox + chips).
10. Wire filter widget into `/admin/organisations` list.
11. Wire attach widget into org-detail page.
12. i18n keys (en/sv/fi).
13. Full pipeline pass.

Estimated ~13 tasks. Larger than the aboutMe series (8 tasks); smaller than a full Phase B onboarding sweep.

---

## Glossary recap

- **Label** = the UI umbrella for tags + categories. No code-level entity.
- **Tag** = flat label. No hierarchy.
- **Category** = label with optional parent. Depth-2 tree max.
- **Attachment** = the join between a label and a target (user/org/rank-history).
- **Global label** = `organisation_id = NULL`. Sysadmin-owned. Read+use by everyone.
- **Org-scoped label** = `organisation_id` set. Read+use by that org's members.
