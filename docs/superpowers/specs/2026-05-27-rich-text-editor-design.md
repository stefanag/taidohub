# Reusable Rich Text Editor — Design

**Status:** approved design — not yet implemented.

**Date:** 2026-05-27

**Author:** Stefan (with Claude)

**Context:** The frontend has accumulated several plain-text fields that
would benefit from light formatting (belt-rank descriptions, organisation
about-text, rank-history notes). This spec defines a reusable `<RichTextEditor>`
primitive — and its read-only twin `<QuillViewer>` — that any form in the
app can adopt. This first pass ships **only the components**; binding them
to existing form fields is deliberately deferred to follow-ups.

---

## 1. Goals

- A `<RichTextEditor>` shared/ui primitive that any form can drop in.
- A `<QuillViewer>` shared/ui twin for read-only rendering with **guaranteed
  visual parity** with the editor.
- A well-bounded formatting surface (headings H2/H3, bold/italic, lists,
  links, blockquote, inline code) — predictable output, predictable
  sanitisation.
- A storage contract (Quill **Delta JSON**) that round-trips perfectly and
  is structurally validatable.
- Visual integration with the app's MD3 brand tokens via a thin theme
  override layer over Quill's `snow` theme.

## 2. Non-goals (v1)

- **No form bindings.** The component is the deliverable; binding it into
  `<BeltRankForm>` (or `<OrganisationForm>`, or `<RankHistoryFormDialog>`)
  is explicitly deferred. Adoption is a per-field follow-up.
- **No backend changes.** No new contracts, no new endpoints, no DB column
  migrations. When a future task binds the editor to a real form, the field
  storage strategy (`text` column holding stringified Delta JSON) gets
  chosen at that point.
- **No image upload.** The toolbar omits images; we don't wire an upload
  handler, an S3/Supabase bucket, or signed URLs.
- **No tables, custom fonts, custom colours, embedded video.** The `formats`
  allowlist forbids them.
- **No localised wrapper.** Three-locale field handling (EN/SV/FI) is a
  form-layer concern; the editor itself handles one value.
- **No collaborative / real-time editing.** Single-user.
- **No Markdown import/export.** Delta only.

## 3. Decisions locked during brainstorming

1. **Scope** — future-proof reusable primitive in `shared/ui`. Not bound to
   any forms in v1.
2. **Library** — `react-quill-new` (tracks Quill 2.x, official React 18/19
   support, actively maintained as of 2026). Avoids the original
   `react-quill` (last released 2020, React 19 peer-dep conflict). Avoids
   native Quill wrapping (premature for our needs).
3. **Toolbar surface — "Standard"** — bold, italic, H2/H3, ordered/bullet
   lists, blockquote, inline code, link, clear formatting.
4. **Storage format** — Quill **Delta JSON**. Structurally validatable.
   Round-trips perfectly. Requires bundling Quill anywhere we render
   read-only content — accepted trade-off.
5. **Read-only renderer** — bundled `<QuillViewer>` using a Quill instance
   with `toolbar: false`, `readOnly: true`. Parity with the editor is the
   priority; bundle cost is acceptable and can be revisited via lazy
   loading if measured.
6. **Theming** — Quill snow theme + thin MD3 tokenisation overrides
   (~30-50 lines of CSS).

---

## 4. Architecture

A new FSD shared/ui slice at `apps/frontend/src/shared/ui/rich-text/`:

```
shared/ui/rich-text/
  RichTextEditor.tsx        — the editor (toolbar + editable surface)
  QuillViewer.tsx           — the read-only twin
  delta.ts                  — Delta type re-export + helpers
  rich-text.css             — Quill snow theme overrides → MD3 tokens
  index.ts                  — barrel
```

Top-level `apps/frontend/src/shared/ui/index.ts` re-exports
`RichTextEditor`, `QuillViewer`, and the `Delta` type so consumers can write
`import { RichTextEditor } from '@/shared/ui'`.

**New runtime dependencies** added to `apps/frontend/package.json`:

- `react-quill-new` — the React wrapper. Ships with Quill 2 as a peer
  dependency satisfied transitively.
- `quill` — pulled in by `react-quill-new`; pinned to the same version the
  wrapper resolves to ensure deterministic builds.

**No new dev dependencies.**

No backend changes. No `@repo/contracts` changes. No DB migration.

## 5. Component API

### 5.1 `<RichTextEditor>`

```tsx
import type { Delta } from '@/shared/ui/rich-text';

interface RichTextEditorProps {
  value: Delta;
  onChange: (next: Delta) => void;

  /** Translated placeholder text. Component is i18n-agnostic — caller
   *  supplies the string via `t('…')`. */
  placeholder?: string;

  /** Accessible label. Becomes `aria-label` on the editable region.
   *  Caller passes `t('…')`. */
  ariaLabel?: string;

  /** Disable editing without losing toolbar visibility (e.g. a form's
   *  "view-only" mode). Defaults to false. */
  readOnly?: boolean;

  className?: string;

  /** Optional id for the editor's `<div>`; used by callers who want their
   *  own `<Label htmlFor={...}>` association. */
  id?: string;
}
```

### 5.2 `<QuillViewer>`

```tsx
interface QuillViewerProps {
  value: Delta;
  className?: string;
}
```

The viewer renders the same Delta the editor produces, with the toolbar
hidden and the editing affordance disabled. Visual parity with the editor
is the contract — same fonts, same headings, same list styling, same
blockquote indentation. This is the entire reason we picked option (a) over
a delta-to-html converter during brainstorming: no drift between author
view and reader view.

### 5.3 `delta.ts` — type + helpers

```ts
// Re-export Quill's own Delta type so consumers have one canonical name.
export type { Delta } from 'quill/core';

/** The canonical empty Delta. Quill represents an empty document with a
 *  single newline insert. */
export function emptyDelta(): Delta { /* … */ }

/** True when the Delta has no user-authored content (only the trailing
 *  newline). Useful for "no description yet" guards on viewer surfaces. */
export function isEmpty(d: Delta): boolean { /* … */ }
```

No other helpers in v1. If callers need Delta-to-plain-text for search
indexing or audit-log diffs, that's a follow-up addition.

## 6. Toolbar configuration

Configured inline in `RichTextEditor.tsx`:

```tsx
const TOOLBAR = [
  [{ header: [2, 3, false] }],   // H2 / H3 / paragraph
  ['bold', 'italic'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code'],         // 'code' = inline code; no code-block
  ['link'],
  ['clean'],                       // clear formatting
];

const FORMATS = [
  'header',
  'bold', 'italic',
  'list',
  'blockquote', 'code',
  'link',
];
```

`FORMATS` is the canonical sanitisation surface. Quill strips any blot or
inline format not on this list from typed, pasted, or programmatically
inserted content. We don't need DOMPurify because:

- We never call `dangerouslySetInnerHTML` on Quill's output — the viewer
  delegates to a Quill instance.
- The Delta format is structured ops, not raw HTML — there is no script
  injection vector at the storage boundary.

(If we ever expose `dangerouslySetInnerHTML` for SSR or a non-Quill
renderer, DOMPurify becomes mandatory at that boundary. v1 has no such
renderer.)

## 7. Theming

### 7.1 Strategy

`rich-text.css` is imported once from `index.ts` so consumers don't need to
remember to import the stylesheet. Inside the file:

1. `@import 'react-quill-new/dist/quill.snow.css';` — the snow base.
2. ~30-50 lines of overrides remapping snow's hardcoded values to MD3 tokens.

### 7.2 Token mapping (illustrative — final values pinned in the
implementation plan)

| Snow element | Default | Override target |
|---|---|---|
| Toolbar background | `#fff` (white border-bottom) | `var(--surface-container-low)` |
| Toolbar border | `#ccc` | `var(--border)` |
| Active toolbar button | `#06c` (blue) | `var(--secondary-container)` text on `var(--on-secondary-container)` |
| Link popover bg | `#fff` | `var(--surface-container-high)` |
| Editor border | `#ccc` (snow's `.ql-container`) | `var(--border)` → `var(--ring)` on focus |
| Editor body font | Helvetica fallback | inherit from `body` (app font stack) |
| Heading sizes | snow's rems | inherit from `.prose` if applied, else explicit MD3 type ramp |
| Border-radius | snow's `0` | match shadcn `--radius` |

Editor content optionally inherits Tailwind's typography plugin (`prose`)
where it doesn't conflict with Quill's own DOM. The override file uses
class selectors namespaced under `.ql-snow` to avoid leaking into the rest
of the app.

### 7.3 Dark mode

MD3 tokens are theme-aware, so the override file naturally tracks light/dark
theme switches. No `.dark` selector required in `rich-text.css` itself.

## 8. Loading / bundle strategy

No lazy boundary in v1. Reasons:

- **Admin pages** that load the editor are already auth-gated; the bundle
  cost is irrelevant for TTI on those routes.
- **Public pages** that render the viewer (e.g. `pages/public-rank/`)
  benefit from TanStack Router's per-route code-splitting automatically.
  Quill lands in the public chunk only when a public route imports it.
- **Pre-optimisation risk.** A `lazy()` boundary adds Suspense boundaries
  and complicates SSR if we ever introduce it.

Mitigation if measured TTI on the public page becomes a real concern:

- Add a `lazy()` wrapper around `<QuillViewer>` exported as
  `LazyQuillViewer` from the barrel, and switch the public page to use
  the lazy variant.

## 9. Testing strategy

Quill's reliance on `contenteditable` makes deep keystroke-level testing
flaky under jsdom. We test what matters and lean on manual verification for
the rest.

### 9.1 Vitest coverage

| Component | Test |
|---|---|
| `<RichTextEditor>` | Mounts without throwing |
| `<RichTextEditor>` | Renders expected toolbar buttons (`getByRole('button', { name: /bold/i })` etc.) |
| `<RichTextEditor>` | Accepts a seeded Delta and reflects it in the DOM (bold span / heading element present) |
| `<RichTextEditor>` | `readOnly: true` disables the editable region |
| `<QuillViewer>` | Renders the formatted output |
| `<QuillViewer>` | Has no toolbar and is not editable |
| `delta.ts` | `emptyDelta()` returns the canonical empty value |
| `delta.ts` | `isEmpty()` true for empty Delta, false for any user content |

### 9.2 What we skip

- **User keystroke round-trips.** Typing into a Quill editor under jsdom is
  brittle; the relevant assertion ("typing 'a' produces a Delta with op
  `{ insert: 'a' }`") tests Quill itself, not our component. Manual
  verification covers it.
- **Image / table / colour interactions.** Not in the toolbar.

### 9.3 Future Playwright e2e

When the app gets a Playwright harness (separate initiative), the editor's
authoring experience is a natural target.

## 10. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `react-quill-new` becomes unmaintained | Low (active in 2026) | Medium | API surface is small; we can swap to a native `quill` wrapper in <1 day if needed. |
| Quill 3.x changes the DOM and our CSS overrides break | Medium (Quill 3 in flight) | Low | Override file is namespaced under `.ql-snow`; failing overrides degrade gracefully to snow's defaults. |
| Delta JSON is more verbose than HTML for trivial content | Medium | Low | We don't store anywhere in v1. When we do, Postgres `text` handles JSON-stringified Delta fine; a future `jsonb` migration is a one-liner. |
| jsdom tests can't exercise real editing | Certain | Low | Acknowledged — manual verification + future Playwright. |
| Public-page bundle size grows by ~150 KB gz | Certain | Low-Med | Accepted explicitly during brainstorming; lazy `<QuillViewer>` is a one-line follow-up if measured. |

## 11. Migration / adoption path (informational — not in v1)

When a future task wants to bind the editor to a form:

1. The field's contract schema gains a Zod definition for Delta. The
   simplest form is `z.object({ ops: z.array(z.unknown()) })` with a
   semantic refinement in the consumer.
2. The form uses RHF's `<Controller>` to wire `value`/`onChange` to the
   `<RichTextEditor>`. The same Controller composes naturally with the
   existing form pattern.
3. The DB column stays `text`; the API stringifies/parses at the boundary.
4. The display surface (public page, admin Profile tab, etc.) uses
   `<QuillViewer>` with the parsed Delta.

None of these steps land in this spec.

## 12. Open questions for review

1. **Stylesheet import location** — `rich-text.css` imported from the
   slice's `index.ts` (chosen) vs imported in `app/main.tsx`. The slice
   import keeps the dependency localised; the app-level import gives a
   single global stylesheet manifest. Recommend slice-level; flag if you
   prefer the app-level approach.
2. **`Delta` type re-export source** — `quill/core` (chosen) vs
   `react-quill-new`'s typed alias if it provides one. Equivalent in
   practice; final pick at implementation time.
3. **Future `<LocalisedRichTextEditor>` wrapper** — out of scope here, but
   worth noting that the EN/SV/FI belt-rank use case will likely want one
   when adoption begins. A separate, slim wrapper around three
   `<RichTextEditor>` instances behind tabs.

## 13. Deliberate scope decisions (recap)

- Reusable primitive in `shared/ui` — not bound to any forms.
- `react-quill-new` for the React layer, Quill 2.x underneath.
- Standard toolbar surface (no images, tables, fonts, video).
- Delta JSON as the value contract; viewer guarantees parity.
- Quill snow theme + thin MD3 overrides; no full custom theme yet.
- No lazy boundary; revisit if public-page TTI degrades.
- Vitest coverage for smoke + initial-value + `isEmpty`, no keystroke tests.
- No backend touch, no contract touch, no migration.
