# Follow-ups

Running list of work explicitly deferred out of a v1 feature. When picking
the next thing to build, this is the backlog to draw from. Move an item out
of this file (with a strikethrough or a deletion) the moment a plan is
written for it.

## Organisations admin

Deferred from the v1 organisations admin (spec: `superpowers/specs/2026-05-15-organisations-admin-design.md`).

- **Logo upload**: v1 stores `logo_url` as a plain text URL. Add object-store
  (Supabase Storage / S3) upload with the file picker, image validation
  (max size, dimensions, mime type), and a signed-URL refresh path.
- **Bulk import / CSV**: sysadmin uploads a CSV of organisations (e.g. seed
  a country's club list). Needs a dry-run validation step and a row-level
  error report.
- **Audit log**: structured log of every create/update/move/delete on
  organisations — who, when, before/after. Probably a generic
  `audit_log` table reusable across admin features.
- **Soft delete**: today `DELETE` is hard; with audit + recovery in mind,
  switch to `deleted_at` and a "Recently deleted" view.
- **Non-admin read access to the tree**: the API supports read-by-anyone
  if we relax the CASL rule, but no UI surfaces it yet. Decide where
  authenticated non-admin users should see the federation tree (public
  marketing page? authenticated dashboard widget?) and build it then.

## CI rot (pre-existing — surfaced while landing PR #9)

CI has been red on every push to `main` since at least 2026-05-15. PR #9
chased a few of these (pnpm/Node/env-file alignment) but several remain.
Each is independent and can be picked off in isolation.

- **`frontend#arch` (Steiger FSD lint): 24 errors, 6 warnings.**
  - `fsd/forbidden-imports` in `widgets/appsidebar/ui/AppSidebar.tsx`
    and `widgets/header/ui/Header.tsx`.
  - `fsd/insignificant-slice` on six single-file slices
    (`entities/post`, `widgets/locale-switcher`, `widgets/organisation-tree`,
    and the three `features/organisation-*-dialog` / `-form` slices).
    Probably resolvable by adding a second public unit to each slice or
    by configuring Steiger to allow them.
  - `fsd/no-public-api-sidestep` across many files (`app/providers/*`,
    `app/router/routes/*.test.*`, `entities/*/api/*.ts`, `pages/*/ui/*.tsx`,
    `widgets/appsidebar/ui/AppSidebar.test.tsx`,
    `widgets/locale-switcher/ui/LocaleSwitcher.test.tsx`). Most of these
    pre-date the org admin work and reach into other slices' `api/`
    or `ui/` directly instead of going through the slice barrel. Fix is
    grep-and-replace + add re-exports to each slice's `index.ts`.
- **`backend e2e`**: `TypeError: Missing parameter name at index 11:
  /api/auth/*` — Express 5 / path-to-regexp v8 dropped the `*` glob.
  Same class of bug we hit in main app code earlier (fixed there with a
  prefix mount). The e2e setup still uses the old glob form somewhere.
- **`openapi spec is committed`**: `openapi:generate` exits 1 after
  picking up the missing `.env` correctly. Likely a runtime error from
  `src/openapi/generate.ts` (DB or Nest bootstrap touches a missing
  env var). Need to inspect the full log; not yet investigated.

Smaller hygiene items worth doing while in there:
- The frontend `pnpm typecheck` script reliably hangs on Windows in this
  environment (causing `pnpm build` to never complete). `pnpm exec tsc
  --noEmit` works. Worth understanding why the script form hangs.
