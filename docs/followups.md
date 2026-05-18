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
- **Soft delete**: today `DELETE` is hard; with audit + recovery in mind,
  switch to `deleted_at` and a "Recently deleted" view.
- **Non-admin read access to the tree**: the API supports read-by-anyone
  if we relax the CASL rule, but no UI surfaces it yet. Decide where
  authenticated non-admin users should see the federation tree (public
  marketing page? authenticated dashboard widget?) and build it then.

## Audit log

Deferred from the v1 audit log (spec: `superpowers/specs/2026-05-17-audit-log-design.md`).

- **Hydrate the "Who" column from users.** v1 shows the raw `user_id`.
  Join in the list endpoint and display the email (with the id as a
  tooltip). Trivial once we have a Users admin module to share the
  lookup with.
- **CSV export of audit rows.** "Download filtered results" button on
  the dedicated admin page. Streams CSV from the same
  `GET /admin/audit-log` endpoint with `?format=csv`.
- **Saved filter presets.** Let admins bookmark
  `entityType=organisation&action=delete` etc. as named filters
  (localStorage v1, server-side later).
- **Semantic diff viewer.** v1 uses two JSON blocks with key-level
  highlighting. Replace with a proper structural diff (e.g.
  `jsondiffpatch`) — easier to scan large records.

## Hygiene

- **Frontend `pnpm typecheck` hangs on Windows.** `pnpm --filter frontend
  typecheck` (which is `tsc --noEmit`) silently hangs in this development
  environment; `pnpm --filter frontend exec tsc --noEmit` works fine.
  Not a CI issue (CI runs Linux), but it bites local feedback loops.
  Worth understanding why the script form hangs — probably a pnpm/Windows
  child-process I/O thing.
