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

## Hygiene

- **Frontend `pnpm typecheck` hangs on Windows.** `pnpm --filter frontend
  typecheck` (which is `tsc --noEmit`) silently hangs in this development
  environment; `pnpm --filter frontend exec tsc --noEmit` works fine.
  Not a CI issue (CI runs Linux), but it bites local feedback loops.
  Worth understanding why the script form hangs — probably a pnpm/Windows
  child-process I/O thing.
