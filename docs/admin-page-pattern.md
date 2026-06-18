# Admin page pattern

How sysadmin-facing CRUD surfaces are structured in this app. Each admin
resource has one **layout**, one **list** index, plus dedicated `new`,
`view`, and `edit` pages — each at its own URL, each rendered by its own
page component. Dialogs are reserved for `window.confirm`-style
destructive confirmations.

The first reference implementation is `admin-patterns`. `admin-techniques`
has been retrofitted to the same shape.

## URL structure

| URL                                  | Purpose                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| `/admin/<resource>`                  | **List** + filters                                           |
| `/admin/<resource>/new`              | **Create** form                                              |
| `/admin/<resource>/$id`              | **View** (read-only detail) + Edit/Delete actions            |
| `/admin/<resource>/$id/edit`         | **Edit** form                                                |

Every record is linkable. The browser back button works. Filter state on
the list page lives in the URL (see §5), so a shared list link restores
exactly the view the sender saw.

## 1. Route files (TanStack file-based)

```
_app.admin.<resource>.tsx              ← layout: sysadmin guard + <Outlet />
_app.admin.<resource>.index.tsx        ← list
_app.admin.<resource>.new.tsx          ← create
_app.admin.<resource>.$id.tsx          ← view
_app.admin.<resource>.$id.edit.tsx     ← edit
```

The parent `_app.admin.<resource>.tsx` carries the sysadmin `beforeLoad`
guard **once**. Every child inherits it via the route hierarchy and
needs no extra guard. Children's `getParentRoute` returns the layout
route; their paths are relative.

## 2. Page components (nested directories)

```
pages/admin/<resource>/list/    ← AdminResourceListPage
pages/admin/<resource>/new/     ← AdminResourceNewPage
pages/admin/<resource>/view/    ← AdminResourceViewPage
pages/admin/<resource>/edit/    ← AdminResourceEditPage
```

Each directory keeps the standard `ui/` + `index.ts` layout. Nested
dirs (rather than flat `pages/admin-<resource>-edit/` siblings) make
it obvious which page belongs to which resource and leaves room for
co-located helpers in `_shared/` later.

## 3. Form component

One reusable `<ResourceForm>` per resource lives in
`features/<resource>-form/`. It is dialog-free:

```ts
export interface ResourceFormProps {
  resource?: Resource;        // omitted = create mode
  onSaved: () => void;        // call after a successful mutation
  onCancel: () => void;       // call when the user clicks Cancel
}
```

The form renders fields + a Save/Cancel pair. **The page** supplies the
heading, container, and any surrounding chrome. No `Dialog*` primitives.

When the existing `*FormDialog` is retired:
- Move the form body into `features/<resource>-form/ui/<Resource>Form.tsx`
- Drop the `*FormDialog.tsx` and its test
- Update the feature's `index.ts` barrel

## 4. View page

A read-only detail page that displays every editable field plus an
**audit footer** with:

- `createdAt` — formatted via the project's date locale helpers
- `updatedAt` — same
- `createdByOrganisationId` → display the org's `nameEn` via the orgs
  query; fall back to the raw UUID if the org is missing or the query
  hasn't resolved

Two actions live at the top right: **Edit** (`navigate({ to: …/$id/edit })`)
and **Delete** (`window.confirm` + mutation; on success, navigate back
to the list).

## 5. List page URL params

Filter state lives in the URL via TanStack Router's `useSearch` /
`navigate({ search: … })`. Each filter dimension is a separate search
key, value is the **classification code** (not the UUID — codes are
the user-stable handle):

| Resource     | Search keys                            |
| ------------ | --------------------------------------- |
| patterns     | `?type=hokei&subtype=yo`               |
| techniques   | `?type=taidotechnique&sotai=sentai&attack=kick` |

Empty / `null` filters omit their key entirely. Multi-select is a
comma-joined string (`?type=hokei,kobo`). The list page resolves codes
to UUIDs via the classification-by-root query at render time — the URL
stays human-readable and survives classification ID changes.

`zod` schemas in `@repo/contracts` provide a tiny `…ListSearchSchema`
to validate the parsed URL on the way in.

## 6. Navigation

| From → To              | Trigger                          |
| ---------------------- | -------------------------------- |
| List → New             | "New …" button                   |
| List → View            | Row click                        |
| View → Edit            | "Edit" button on view page       |
| View → List            | "Back" link or browser back      |
| Edit → View (success)  | After successful save            |
| Edit → View (cancel)   | Cancel button                    |
| New → List (success)   | After successful create          |
| New → List (cancel)    | Cancel button                    |

`Delete` is inline (`window.confirm` + mutation) on **list** and **view**
pages. Destructive actions don't earn their own URL.

## 7. Loading / not-found

Whenever a page reads `useResourceQuery($id)`:

- `isPending` → render a one-line `Loading…` stub. Never an empty form.
- Resolved to `undefined` → render an inline "not found" message with a
  link back to the list. Don't 404 the route — the URL is well-formed;
  the row is just missing.

## 8. Per-row action set on the list

- Row click → navigate to view
- Inline Delete button → `window.confirm` + mutation
- **No** inline Edit button. The view page hosts Edit, which reduces
  visual density on long lists and makes Edit a deliberate action.

## 9. When the pattern doesn't apply

This pattern is for **CRUD resources with non-trivial fields**. It is
**not** the right fit for:

- Multi-step wizards (use a dedicated route with explicit step segments)
- Trivial single-field editors (e.g. toggle a feature flag from the
  list — inline checkbox is correct)
- Read-only catalogues with no admin surface (no `/new` / `/edit` to
  build at all)
