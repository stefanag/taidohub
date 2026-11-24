---
name: ci-verify
description: "The self-verification gate every change must pass locally before a PR is opened, mirroring taidohub's real .github/workflows/ci.yml jobs (build-test, backend-e2e, openapi-sync) exactly: lint, typecheck, arch, build, test, test:e2e, and the OpenAPI drift check. Use after making any change and before pushing or opening a PR. Never report a change as done based on the edit alone."
---

# ci-verify: verification gate

Never call a change finished because the edit applied cleanly. Verify it the way CI actually would. If
any step fails, fix it and rerun from the top — don't push partially verified work, and don't skip a
step because an earlier one looked fine.

## 0. Scope the blast radius

`git diff --name-only` to see what changed, then decide which steps below are required:

- always: lint + typecheck on every touched workspace.
- touched `apps/frontend/src/**` → `arch` (Steiger) is mandatory.
- touched `apps/backend/src/**` → the matching unit specs, and `test:e2e` if a module's controller,
  service, or ability rules changed.
- touched `packages/contracts/src/**` → rebuild contracts, then regenerate and diff-check the OpenAPI
  artifact.
- touched `apps/backend/drizzle/**` → confirm the migration was generated (never hand-written) and
  applies cleanly.
- touched any user-facing string → confirm all three locale files got the same new keys.

## 1. Lint + typecheck (fast, always)

```bash
pnpm lint
pnpm typecheck
```

## 2. Arch (frontend changes)

```bash
pnpm --filter frontend arch
```

A Steiger failure means a same-layer cross-import or a reach into another slice's internals — fix the
import, don't suppress the rule. See the `add-fsd-slice` skill for the layer diagram.

## 3. Tests (targeted, then broad)

```bash
pnpm --filter <workspace> test           # workspace(s) actually touched
pnpm --filter backend test:e2e           # if a backend module's public surface changed
```

Run the full `pnpm test` before opening the PR even if you targeted a subset while iterating — a
touched shared type or schema can break a workspace you didn't directly edit.

## 4. Build

```bash
pnpm build
```

Catches anything lint/typecheck/test didn't (build-time-only errors, missing exports).

## 5. Contracts / OpenAPI sync (if `packages/contracts` changed)

```bash
pnpm --filter @repo/contracts build
pnpm --filter backend openapi:generate
git diff --exit-code packages/contracts/openapi/
```

A non-empty diff here is exactly what CI's `openapi-sync` job checks for and fails on. Commit the diff
now rather than letting CI catch it.

## 6. Migration check (if `apps/backend/drizzle` changed)

Confirm the SQL file was produced by `pnpm --filter backend db:generate`, not hand-written, and that
`pnpm --filter backend db:migrate` (against `DIRECT_URL`) applies it cleanly against a fresh local DB —
see `docs/local-database.md` for the docker-compose setup if you don't have a Supabase project handy.

## 7. i18n check (if any UI string changed)

Confirm `apps/frontend/src/i18n/locales/en.json`, `sv.json`, and `fi.json` all gained the same new keys.
A key present in `en.json` but missing from the other two is the most common miss.

## 8. Verdict

- All required steps green → safe to push and open the PR.
- Anything red you can't safely fix in scope → stop, state exactly which step failed and why, and don't
  open the PR with a known-red step. Widening the fix beyond the original change's scope is itself a
  signal to pause and confirm that's actually wanted, rather than drive-by-refactoring past it.
