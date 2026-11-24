---
name: taido-domain
description: "Domain knowledge for taidohub's martial-arts concepts: belt ranks, patterns/techniques, kobo classification, shogo titles, requirement sets, and organisation-hierarchy resolution. Use before writing any code that touches belt-catalog, grading-requirements, rank-history, pattern, technique, classification-category, or organisation ancestry. Captures schema shapes and gotchas that are NOT obvious from table names alone and have already caused rework once (see docs/superpowers/plans/2026-06-30-grading-requirements.md)."
---

# taido-domain: martial-arts domain reference

This is knowledge that lives in people's heads and in one prior plan document, not in the table names.
Load this before touching any of the modules listed above, and before adapting an external spec via the
`spec-to-plan` skill — an external spec was very likely written against a different (often simpler)
schema shape.

## Core entities

- **Belt system** (`belt_systems`): a named ranking ladder (e.g. the federation's kyu/dan system).
  **Global only** — belt systems are not organisation-scoped; there is one ladder, shared.
- **Belt rank** (`belt_ranks`): one rung of a belt system (`5th kyu`, `1st dan`, ...). **PK is `uuid`,
  not an integer.** Any spec or reference material written against an int-PK source system needs every
  FK to `belt_ranks` translated to uuid before you trust it.
- **Shogo title** (`shogo_titles`): honorific instructor titles, separate from belt rank. Has its own
  visuals (JSONB) and its own minimum-rank gate (`shogo_min_rank`, nullable — a title with no minimum
  is open to any rank).
- **Pattern** (`patterns`) and **technique** (`technique`): the two kinds of practiced content. A
  pattern does **not** have a `type` column. "Kobo" (a specific pattern subtype) is not a schema field —
  it's determined by joining `pattern_classification` → `classification_category` and checking for a row
  with `code = 'kobo'` under the `pattern_type` classification root. Any code that needs to split
  kobo vs. non-kobo patterns must do that join; treating `pattern.type` as if it existed is the exact
  mistake the grading-requirements plan had to correct for.
- **Classification category** (`classification_category`): a general-purpose taxonomy table, of which
  `pattern_type` (kobo/other) is one root. Don't assume it's pattern-specific — check what root a given
  classification is scoped under before reusing this table for something new.

## Requirement sets and rank requirements

- **Requirement set** (`requirement_sets`): a versioned bundle of what's required per rank. Rows are
  scoped by `(rankId, setId)` where **`setId = null` means global** (federation-wide default), and a
  non-null `setId` is an organisation-specific override.
- Always filter with the null-aware pattern, never a bare equality:
  `setId === null ? isNull(t.setId) : eq(t.setId, setId)`. A bare `eq(t.setId, setId)` silently excludes
  every global row when `setId` is null.
- **Exactly one active set per organisation.** Activating a set must, in the same transaction,
  deactivate every other currently-active set for that `organisation_id` first — never just flip the
  target row.
- Requirement detail lives across four tables (techniques, patterns, hokei-pick-N groups, and a scalar
  anchor for jissen/time-in-grade/theory/essay). A **hokei group** with `pickCount` must be clamped to
  `min(pickCount, patternIds.length)` on insert — never store a group that demands more patterns than it
  actually contains.
- A **whole-scope replace** (`PUT /:rankId`) deletes every row for that `(rankId, setId)` across all
  four detail tables and re-inserts from the request body, in one transaction. Partial updates to detail
  rows outside that endpoint should be treated with suspicion — the resolved requirement is meant to be
  replaced as a unit.

## Organisation hierarchy

- Organisations form a tree. A student's applicable requirement set resolves by walking **up** the
  student's organisation through its ancestors until a matching `(rank, setId)` row is found, falling
  back to the global (`setId = null`) row if no ancestor overrides it.
- Ancestor resolution is `OrganisationsRepository.getAncestorIds()`, a recursive CTE. Don't re-implement
  ancestor-walking in application code (N+1 queries, easy to get the base case wrong) — extend that
  method if you need a variant.
- A user's organisation, for resolution purposes, comes from `organisation_membership` with
  `role = 'student'`. **There is no `user_profile.organisationId` column** — don't reach for one. If a
  user has multiple student memberships, resolution takes the most recently `updated_at` one
  (deterministic tie-break), falling back to the actor's primary org if none exists.

## Permission shape for domain subjects

New domain subjects (e.g. `RequirementSet`) typically follow: `manage` for sysadmin (any row) or for
orgadmin/instructor memberships scoped to `{ organisationId: m.organisationId }`; `read` open to any
authenticated user, since resolution is a public-to-authenticated read, not an admin-gated one. Confirm
this against the actual feature before assuming it — some subjects (e.g. labels' update/delete) are
author-scoped rather than role-scoped. See the `add-module` skill's ability-contributor template.

## When a spec disagrees with this file

If you're implementing from a pasted external spec (via `spec-to-plan`) and it assumes an int PK, a
`pattern.type` column, or a different auth/stack (SQLite, Express, a different ORM), this file wins.
Note the adaptation explicitly in the plan's "Global Constraints" section rather than silently
resolving the conflict, so the next reader knows a translation happened and why.
