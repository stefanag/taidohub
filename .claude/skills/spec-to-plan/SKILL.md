---
name: spec-to-plan
description: "Turn a pasted or externally-written feature spec into a taidohub-conventions implementation plan under docs/superpowers/plans/, the way docs/superpowers/plans/2026-06-30-grading-requirements.md turned a spec written against a different stack into one that matches taidohub's actual Postgres/uuid/NestJS/FSD schema. Use whenever implementing from a design doc, a spec pasted into the conversation, or a plan template that wasn't written specifically for this repo. Prevents silently carrying over wrong assumptions (wrong PK types, columns that don't exist here, a different auth/ORM/stack) into shipped code."
---

# spec-to-plan: adapting an external spec to taidohub

External specs (a design doc, a spec from another project, a template pasted into a conversation) are
usually written against *some* schema and stack, but not necessarily taidohub's. Implementing one
directly tends to silently import its assumptions — wrong PK types, columns that don't exist here, a
different framework's idioms — which surface later as bugs or rework rather than at review time. This
skill produces a plan document that makes every adaptation explicit instead.

This complements, not replaces, whatever planning skill you're already using for execution
(`superpowers:subagent-driven-development` or `superpowers:executing-plans`). Produce the plan this way,
then execute it with those.

## 1. Read the spec fully before touching the schema

Understand what the spec is actually asking for as a feature, independent of its assumed stack. Note
anything it states about its own source system (ORM, PK types, auth library) — this often appears as an
offhand note near the end, as in the grading-requirements plan's acknowledgment that its source used
SQLite/better-auth-via-Express.

## 2. Diff the spec's assumed schema against the real one

For every entity the spec references, check the actual `apps/backend/src/infrastructure/database/schema/`
file and, for the domain entities covered there, the `taido-domain` skill. Write down every mismatch
explicitly — don't fix it silently in your head. Common categories, from real precedent:

- **PK/FK types**: the spec assumes int, taidohub uses uuid (or vice versa for a new table).
- **Columns that don't exist**: the spec references a column that's actually a classification join, a
  computed value, or lives on a different table.
- **Resolution logic**: the spec assumes a flat lookup where taidohub resolves through organisation
  ancestry, or assumes a simple equality where a nullable scope column needs null-aware filtering.
- **Stack mismatch**: ORM, auth library, validation library, routing style. Translate to Drizzle /
  better-auth+CASL / Zod-via-nestjs-zod / TanStack Router idioms; don't port the spec's code samples
  verbatim.

## 3. Write the plan document

Create `docs/superpowers/plans/<YYYY-MM-DD>-<feature-slug>.md`, following the shape of
`docs/superpowers/plans/2026-06-30-grading-requirements.md`:

```markdown
# <Feature> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** <one paragraph, what ships and why>

**Architecture:** <how it's actually built here — tables, modules, resolution logic>

**Tech Stack:** <taidohub's real stack, not the spec's>

**Spec:** <where the source spec came from, and a one-line note on what stack/assumptions it made
that differ from here>

## Global Constraints

<every mismatch found in step 2, as a short, specific, checkable statement — this section is what
stops the mismatch from being silently reintroduced by whoever implements the plan>

## File Map

**Created / Modified**, split by workspace (contracts / backend / frontend), listing every file the
`add-module` and/or `add-fsd-slice` skills will touch.

## Tasks

Checkbox-tracked (`- [ ]`), ordered: contracts → schema/migration → repository → service → abilities →
controller → e2e test → frontend entity → frontend feature/page → i18n → openapi sync.
```

## 4. Cross-check against `add-module` / `add-fsd-slice`

Every backend piece in the file map should correspond to a step in the `add-module` skill; every
frontend piece to a step in `add-fsd-slice`. If the plan's file map is missing a piece those skills
require (an `.abilities.spec.ts`, an e2e test, an i18n key set), add it now rather than discovering the
gap mid-implementation.

## 5. Record the decisions

Anything non-obvious decided while resolving a mismatch (which of two reasonable adaptations was taken,
and why) is worth a line in the project's decision record, not just buried in this one plan file, so it
doesn't get re-litigated by the next spec that touches the same area.
