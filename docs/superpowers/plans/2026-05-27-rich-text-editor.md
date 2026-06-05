# Rich Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable `<RichTextEditor>` + `<QuillViewer>` primitive in
`apps/frontend/src/shared/ui/rich-text/` based on `react-quill-new` (Quill 2.x),
storing Delta JSON, themed with thin MD3 overrides over Quill's snow theme,
without binding it to any form in this pass.

**Architecture:** A self-contained FSD shared/ui slice. Two React components
wrap `react-quill-new`: `RichTextEditor` (toolbar + editable surface) and
`QuillViewer` (read-only twin). Both speak the same Delta value contract.
Snow theme CSS is imported once from the slice barrel; MD3 token overrides
live in a sibling CSS file. No backend, no contract, no form bindings.

**Tech Stack:** React 19, Vite, `react-quill-new` (wraps Quill 2.x), Vitest,
Tailwind v4 + MD3 tokens.

**Spec:** [`docs/superpowers/specs/2026-05-27-rich-text-editor-design.md`](../specs/2026-05-27-rich-text-editor-design.md)

**Windows env notes:**
- Don't use `pnpm --filter frontend typecheck` if it hangs. Use direct
  `cd apps/frontend && npx tsc --noEmit`.
- Run scoped tests with `pnpm --filter frontend exec vitest run [path]` —
  reliable. Full-suite via `cd apps/frontend && npx vitest run` if pnpm
  hangs.
- If pnpm hangs at all, kill node processes via PowerShell:
  `Get-Process node | Stop-Process -Force`.

---

### Task 1: Install `react-quill-new` + `quill`

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `pnpm-lock.yaml` (auto-updated)

- [ ] **Step 1: Install the deps**

```
pnpm --filter frontend add react-quill-new quill
```

Expected: PASS — pnpm prints the resolved versions and updates the lockfile.
`react-quill-new` is expected at `^3.x` (Quill 2.x peer satisfied via
`quill` itself).

- [ ] **Step 2: Inspect the diff to `apps/frontend/package.json`**

```
git diff apps/frontend/package.json
```

Expected: two new entries under `dependencies` — `"react-quill-new"` and
`"quill"`. No other changes. If pnpm decided to bump unrelated deps,
abort and investigate before committing.

- [ ] **Step 3: Commit**

```
git add apps/frontend/package.json pnpm-lock.yaml
git commit -m "chore(frontend): add react-quill-new + quill for rich text editor"
```

---

### Task 2: Delta types + helpers (`delta.ts` + tests)

**Files:**
- Create: `apps/frontend/src/shared/ui/rich-text/delta.ts`
- Create: `apps/frontend/src/shared/ui/rich-text/delta.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/shared/ui/rich-text/delta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { emptyDelta, isEmpty } from './delta.js';

describe('emptyDelta', () => {
  it('returns a delta with a single newline insert', () => {
    expect(emptyDelta()).toEqual({ ops: [{ insert: '\n' }] });
  });

  it('returns a fresh object on each call', () => {
    expect(emptyDelta()).not.toBe(emptyDelta());
  });
});

describe('isEmpty', () => {
  it('is true for the canonical empty delta', () => {
    expect(isEmpty(emptyDelta())).toBe(true);
  });

  it('is true for a delta with only whitespace inserts', () => {
    expect(isEmpty({ ops: [{ insert: '   \n' }] })).toBe(true);
  });

  it('is false for a delta with user-authored text', () => {
    expect(isEmpty({ ops: [{ insert: 'hello' }, { insert: '\n' }] })).toBe(false);
  });

  it('is false for a delta with formatted-but-empty content (e.g. a header)', () => {
    expect(
      isEmpty({
        ops: [{ insert: '\n', attributes: { header: 2 } }],
      }),
    ).toBe(false);
  });

  it('is false for a delta with no ops', () => {
    expect(isEmpty({ ops: [] })).toBe(false);
  });

  it('is false for a delta whose ops contain non-string inserts (embeds)', () => {
    expect(isEmpty({ ops: [{ insert: { image: 'x' } }, { insert: '\n' }] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text/delta.test.ts
```

Expected: FAIL — `Cannot find module './delta.js'` (the file does not
exist yet).

- [ ] **Step 3: Implement `delta.ts`**

Create `apps/frontend/src/shared/ui/rich-text/delta.ts`:

```ts
/**
 * Re-export Quill's own `Delta` type so callers have one canonical name to
 * import from this slice. Quill 2 ships its types under `quill/core`.
 */
export type { Delta } from 'quill/core';

import type { Delta } from 'quill/core';

/**
 * The canonical empty Delta. Quill represents an empty document with a
 * single trailing newline insert.
 */
export function emptyDelta(): Delta {
  return { ops: [{ insert: '\n' }] } as Delta;
}

/**
 * True when the Delta has no user-authored content — i.e. either no ops, or
 * only string inserts that consist of whitespace, AND no attributes anywhere.
 * The "single trailing newline" case is covered (it is whitespace + no
 * attributes). Embeds (non-string inserts) and any formatting attributes on
 * any op count as non-empty.
 */
export function isEmpty(d: Delta): boolean {
  if (!d.ops || d.ops.length === 0) return false;
  for (const op of d.ops) {
    if (op.attributes && Object.keys(op.attributes).length > 0) return false;
    if (typeof op.insert !== 'string') return false;
    if (op.insert.replace(/\s+/g, '') !== '') return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text/delta.test.ts
```

Expected: PASS — all 8 cases green.

- [ ] **Step 5: Direct typecheck**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/shared/ui/rich-text/delta.ts apps/frontend/src/shared/ui/rich-text/delta.test.ts
git commit -m "feat(rich-text): Delta type re-export + emptyDelta / isEmpty helpers"
```

---

### Task 3: Theme overrides (`rich-text.css`)

**Files:**
- Create: `apps/frontend/src/shared/ui/rich-text/rich-text.css`

- [ ] **Step 1: Create `rich-text.css`**

Create `apps/frontend/src/shared/ui/rich-text/rich-text.css`:

```css
/*
 * Rich text editor styles. Imports Quill's snow theme as the base, then
 * remaps its hardcoded colours, borders, and typography to the app's MD3
 * brand tokens. All overrides are namespaced under `.ql-snow` (the class
 * snow theme puts on every Quill container) so they cannot leak outside
 * a rich-text instance.
 */

@import 'react-quill-new/dist/quill.snow.css';

/* ──────────────────────────────────────────────────────────────────────
 * Container — editor body and toolbar
 * ────────────────────────────────────────────────────────────────────── */

.ql-snow.ql-toolbar,
.ql-snow .ql-toolbar {
  background-color: var(--surface-container-low);
  border: 1px solid var(--border);
  border-bottom: none;
  border-top-left-radius: var(--radius);
  border-top-right-radius: var(--radius);
}

.ql-snow.ql-container,
.ql-snow .ql-container {
  border: 1px solid var(--border);
  border-bottom-left-radius: var(--radius);
  border-bottom-right-radius: var(--radius);
  font-family: inherit;
  background-color: var(--background);
  color: var(--on-surface, var(--foreground));
}

/* Focus ring on the editor body. Snow has no focus state by default. */
.ql-snow.ql-container:focus-within {
  outline: 2px solid var(--ring);
  outline-offset: -1px;
}

/* ──────────────────────────────────────────────────────────────────────
 * Toolbar buttons
 * ────────────────────────────────────────────────────────────────────── */

.ql-snow .ql-toolbar button,
.ql-snow .ql-toolbar .ql-picker-label {
  color: var(--on-surface-variant, var(--muted-foreground));
}

.ql-snow .ql-toolbar button:hover,
.ql-snow .ql-toolbar button:focus,
.ql-snow .ql-toolbar .ql-picker-label:hover {
  color: var(--on-surface, var(--foreground));
}

.ql-snow .ql-toolbar button.ql-active,
.ql-snow .ql-toolbar .ql-picker-label.ql-active,
.ql-snow .ql-toolbar .ql-picker-item.ql-selected {
  color: var(--on-secondary-container);
  background-color: var(--secondary-container);
  border-radius: calc(var(--radius) - 4px);
}

/* SVG icon strokes inherit the button text colour. */
.ql-snow .ql-toolbar button .ql-stroke,
.ql-snow .ql-toolbar .ql-picker-label .ql-stroke {
  stroke: currentColor;
}

.ql-snow .ql-toolbar button .ql-fill,
.ql-snow .ql-toolbar .ql-picker-label .ql-fill {
  fill: currentColor;
}

/* ──────────────────────────────────────────────────────────────────────
 * Picker dropdown (heading select)
 * ────────────────────────────────────────────────────────────────────── */

.ql-snow .ql-picker-options {
  background-color: var(--surface-container-high);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--on-surface, var(--foreground));
}

/* ──────────────────────────────────────────────────────────────────────
 * Link tooltip
 * ────────────────────────────────────────────────────────────────────── */

.ql-snow .ql-tooltip {
  background-color: var(--surface-container-high);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--on-surface, var(--foreground));
  box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
}

.ql-snow .ql-tooltip input[type='text'] {
  background-color: var(--background);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 4px);
  color: var(--on-surface, var(--foreground));
}

/* ──────────────────────────────────────────────────────────────────────
 * Editor content typography
 * ────────────────────────────────────────────────────────────────────── */

.ql-snow .ql-editor {
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  min-height: 8rem;
}

.ql-snow .ql-editor h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.ql-snow .ql-editor h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.ql-snow .ql-editor blockquote {
  border-left: 4px solid var(--border);
  padding-left: 1rem;
  color: var(--on-surface-variant, var(--muted-foreground));
  font-style: italic;
}

.ql-snow .ql-editor code {
  background-color: var(--surface-container-high);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}

.ql-snow .ql-editor a {
  color: var(--primary);
  text-decoration: underline;
}

/* Placeholder text colour. */
.ql-snow .ql-editor.ql-blank::before {
  color: var(--on-surface-variant, var(--muted-foreground));
  font-style: italic;
  opacity: 0.7;
}

/* ──────────────────────────────────────────────────────────────────────
 * Viewer mode — used by <QuillViewer>. The viewer renders a Quill
 * instance with `toolbar: false` and `readOnly: true`. The wrapper
 * container carries `.ql-viewer` so we can drop the editor's outer
 * border + min-height padding for plain inline display.
 * ────────────────────────────────────────────────────────────────────── */

.ql-viewer .ql-snow.ql-container,
.ql-viewer .ql-snow .ql-container {
  border: none;
  background-color: transparent;
}

.ql-viewer .ql-snow.ql-container:focus-within {
  outline: none;
}

.ql-viewer .ql-snow .ql-editor {
  padding: 0;
  min-height: 0;
}
```

- [ ] **Step 2: Commit**

```
git add apps/frontend/src/shared/ui/rich-text/rich-text.css
git commit -m "feat(rich-text): snow theme + MD3 token overrides"
```

---

### Task 4: `QuillViewer.tsx` component + tests

**Files:**
- Create: `apps/frontend/src/shared/ui/rich-text/QuillViewer.tsx`
- Create: `apps/frontend/src/shared/ui/rich-text/QuillViewer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/shared/ui/rich-text/QuillViewer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { QuillViewer } from './QuillViewer.js';
import type { Delta } from './delta.js';

// jsdom polyfills required by Quill's selection/range usage.
beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
});

const HELLO_BOLD: Delta = {
  ops: [
    { insert: 'Hello ' },
    { insert: 'world', attributes: { bold: true } },
    { insert: '\n' },
  ],
} as unknown as Delta;

describe('<QuillViewer>', () => {
  it('renders the formatted text from the Delta', () => {
    const { container } = render(<QuillViewer value={HELLO_BOLD} />);
    const editor = container.querySelector('.ql-editor');
    expect(editor).not.toBeNull();
    expect(editor?.textContent).toContain('Hello');
    expect(editor?.textContent).toContain('world');
    // Bold attribute renders as <strong>.
    expect(editor?.querySelector('strong')).not.toBeNull();
  });

  it('does not render a toolbar', () => {
    const { container } = render(<QuillViewer value={HELLO_BOLD} />);
    expect(container.querySelector('.ql-toolbar')).toBeNull();
  });

  it('disables editing (contenteditable=false)', () => {
    const { container } = render(<QuillViewer value={HELLO_BOLD} />);
    const editor = container.querySelector('.ql-editor');
    expect(editor?.getAttribute('contenteditable')).toBe('false');
  });

  it('applies the `ql-viewer` wrapper class so the viewer-mode CSS strips the border', () => {
    const { container } = render(<QuillViewer value={HELLO_BOLD} />);
    expect(container.querySelector('.ql-viewer')).not.toBeNull();
  });

  it('forwards a custom className onto the wrapper', () => {
    const { container } = render(<QuillViewer value={HELLO_BOLD} className="my-extra" />);
    expect(container.querySelector('.ql-viewer.my-extra')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text/QuillViewer.test.tsx
```

Expected: FAIL — `Cannot find module './QuillViewer.js'`.

- [ ] **Step 3: Implement `QuillViewer.tsx`**

Create `apps/frontend/src/shared/ui/rich-text/QuillViewer.tsx`:

```tsx
import * as React from 'react';
import ReactQuill from 'react-quill-new';

import { cn } from '@/shared/lib/utils';

import type { Delta } from './delta.js';

export interface QuillViewerProps {
  value: Delta;
  className?: string;
}

const FORMATS = ['header', 'bold', 'italic', 'list', 'blockquote', 'code', 'link'];

/**
 * Read-only twin of {@link RichTextEditor}. Renders a Quill instance with
 * the toolbar disabled and editing turned off. Visual parity with the
 * editor is the explicit contract — same fonts, headings, list styling,
 * blockquote indentation. The outer wrapper carries the `.ql-viewer` class
 * so the slice's stylesheet can drop the editor border and min-height for
 * inline display.
 */
export function QuillViewer({ value, className }: QuillViewerProps): React.ReactElement {
  return (
    <div className={cn('ql-viewer', className)}>
      <ReactQuill
        value={value}
        readOnly
        theme="snow"
        formats={FORMATS}
        modules={{ toolbar: false }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text/QuillViewer.test.tsx
```

Expected: PASS — all 5 cases green.

- [ ] **Step 5: Direct typecheck**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/shared/ui/rich-text/QuillViewer.tsx apps/frontend/src/shared/ui/rich-text/QuillViewer.test.tsx
git commit -m "feat(rich-text): QuillViewer — read-only Delta renderer"
```

---

### Task 5: `RichTextEditor.tsx` component + tests

**Files:**
- Create: `apps/frontend/src/shared/ui/rich-text/RichTextEditor.tsx`
- Create: `apps/frontend/src/shared/ui/rich-text/RichTextEditor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/shared/ui/rich-text/RichTextEditor.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { RichTextEditor } from './RichTextEditor.js';
import { emptyDelta, type Delta } from './delta.js';

// jsdom polyfills required by Quill's selection/range usage.
beforeAll(() => {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
});

const HELLO_BOLD: Delta = {
  ops: [
    { insert: 'Hello ' },
    { insert: 'world', attributes: { bold: true } },
    { insert: '\n' },
  ],
} as unknown as Delta;

describe('<RichTextEditor>', () => {
  it('mounts without throwing', () => {
    expect(() =>
      render(<RichTextEditor value={emptyDelta()} onChange={vi.fn()} />),
    ).not.toThrow();
  });

  it('renders the snow toolbar', () => {
    const { container } = render(
      <RichTextEditor value={emptyDelta()} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.ql-toolbar')).not.toBeNull();
  });

  it('renders the configured toolbar buttons (bold, italic, link, clean)', () => {
    const { container } = render(
      <RichTextEditor value={emptyDelta()} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.ql-toolbar .ql-bold')).not.toBeNull();
    expect(container.querySelector('.ql-toolbar .ql-italic')).not.toBeNull();
    expect(container.querySelector('.ql-toolbar .ql-link')).not.toBeNull();
    expect(container.querySelector('.ql-toolbar .ql-clean')).not.toBeNull();
  });

  it('renders the heading picker (H2 / H3 / paragraph)', () => {
    const { container } = render(
      <RichTextEditor value={emptyDelta()} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.ql-toolbar .ql-header')).not.toBeNull();
  });

  it('reflects an initial Delta value in the editor body', () => {
    const { container } = render(
      <RichTextEditor value={HELLO_BOLD} onChange={vi.fn()} />,
    );
    const editor = container.querySelector('.ql-editor');
    expect(editor?.textContent).toContain('Hello');
    expect(editor?.textContent).toContain('world');
    expect(editor?.querySelector('strong')).not.toBeNull();
  });

  it('respects `readOnly` by setting contenteditable=false on the editor body', () => {
    const { container } = render(
      <RichTextEditor value={emptyDelta()} onChange={vi.fn()} readOnly />,
    );
    const editor = container.querySelector('.ql-editor');
    expect(editor?.getAttribute('contenteditable')).toBe('false');
  });

  it('exposes `ariaLabel` somewhere on the rendered tree', () => {
    // `react-quill-new` forwards `aria-label` onto its outer wrapper, not
    // the inner `.ql-editor` body. Asserting against the wrapper keeps the
    // test resilient to the wrapper's internal DOM layout.
    const { container } = render(
      <RichTextEditor
        value={emptyDelta()}
        onChange={vi.fn()}
        ariaLabel="Description"
      />,
    );
    expect(container.querySelector('[aria-label="Description"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text/RichTextEditor.test.tsx
```

Expected: FAIL — `Cannot find module './RichTextEditor.js'`.

- [ ] **Step 3: Implement `RichTextEditor.tsx`**

Create `apps/frontend/src/shared/ui/rich-text/RichTextEditor.tsx`:

```tsx
import * as React from 'react';
import ReactQuill from 'react-quill-new';

import { cn } from '@/shared/lib/utils';

import type { Delta } from './delta.js';

export interface RichTextEditorProps {
  value: Delta;
  onChange: (next: Delta) => void;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  className?: string;
  id?: string;
}

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code'],
  ['link'],
  ['clean'],
];

const FORMATS = ['header', 'bold', 'italic', 'list', 'blockquote', 'code', 'link'];

/**
 * Reusable rich text editor. Stores content as a Quill `Delta` and emits a
 * new Delta on every change. The toolbar surface is the locked "Standard"
 * set defined in the design spec: bold, italic, H2/H3, lists, blockquote,
 * inline code, link, clear formatting.
 *
 * Caller-supplied labels (`placeholder`, `ariaLabel`) are passed through
 * verbatim so the component stays i18n-agnostic — callers provide
 * translated strings via `t('...')`.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  readOnly,
  className,
  id,
}: RichTextEditorProps): React.ReactElement {
  const modules = React.useMemo(() => ({ toolbar: TOOLBAR }), []);
  const handleChange = React.useCallback<
    (html: string, delta: unknown, source: unknown, editor: { getContents: () => Delta }) => void
  >(
    (_html, _delta, _source, editor) => {
      onChange(editor.getContents());
    },
    [onChange],
  );

  return (
    <div className={cn(className)} id={id}>
      <ReactQuill
        value={value}
        onChange={handleChange}
        readOnly={readOnly === true}
        theme="snow"
        placeholder={placeholder}
        modules={modules}
        formats={FORMATS}
        aria-label={ariaLabel}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text/RichTextEditor.test.tsx
```

Expected: PASS — all 7 cases green.

- [ ] **Step 5: Direct typecheck**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/shared/ui/rich-text/RichTextEditor.tsx apps/frontend/src/shared/ui/rich-text/RichTextEditor.test.tsx
git commit -m "feat(rich-text): RichTextEditor with Standard toolbar + Delta value contract"
```

---

### Task 6: Barrel + top-level `shared/ui` re-export

**Files:**
- Create: `apps/frontend/src/shared/ui/rich-text/index.ts`
- Modify: `apps/frontend/src/shared/ui/index.ts`

- [ ] **Step 1: Create the slice barrel**

Create `apps/frontend/src/shared/ui/rich-text/index.ts`:

```ts
import './rich-text.css';

export { RichTextEditor, type RichTextEditorProps } from './RichTextEditor.js';
export { QuillViewer, type QuillViewerProps } from './QuillViewer.js';
export { emptyDelta, isEmpty, type Delta } from './delta.js';
```

The `import './rich-text.css';` side-effect is what guarantees consumers
never have to remember to import the stylesheet themselves.

- [ ] **Step 2: Re-export from the top-level `shared/ui` barrel**

Open `apps/frontend/src/shared/ui/index.ts` and append at the bottom (after
the existing `export * from './...'` lines — mirror how the BeltGraphic and
BeltBadge primitives were added in Plan B Task 8 and Task 9):

```ts
export * from './rich-text/index.js';
```

- [ ] **Step 3: Run both component tests to confirm nothing regressed**

```
pnpm --filter frontend exec vitest run src/shared/ui/rich-text
```

Expected: PASS — all delta/editor/viewer suites green (8 + 7 + 5 = 20 tests).

- [ ] **Step 4: Direct typecheck**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0.

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/shared/ui/rich-text/index.ts apps/frontend/src/shared/ui/index.ts
git commit -m "feat(rich-text): slice barrel + re-export from shared/ui top barrel"
```

---

### Task 7: Full frontend pipeline + manual verification

**Files:**
- (no source files — verification task; no commit expected unless something
  was missed in earlier tasks)

- [ ] **Step 1: Run the full frontend test suite**

```
pnpm --filter frontend exec vitest run
```

Expected: PASS — every existing test stays green PLUS the 20 new
rich-text tests. The total test count should be the pre-task baseline + 20.

- [ ] **Step 2: Run the Steiger architecture lint**

```
cd apps/frontend && npm run arch
```

Expected: PASS — 0 errors. Pre-existing `fsd/insignificant-slice` warnings
are fine. No new errors should appear — the new slice lives under
`shared/ui/` which Steiger's FSD rules accept by default.

- [ ] **Step 3: Direct typecheck (final)**

```
cd apps/frontend && npx tsc --noEmit
```

Expected: PASS — exit 0, no output.

- [ ] **Step 4: Build to confirm Vite can bundle Quill cleanly**

```
cd apps/frontend && npx vite build
```

Expected: PASS — Vite reports `built in N.NN s`. There WILL be a "Some
chunks are larger than 500 kB after minification" warning — Quill is large
enough to trigger it. That's expected and acknowledged in the spec; do not
attempt to silence the warning here.

- [ ] **Step 5: Manual verification (perform by hand)**

The spec acknowledges that jsdom can't exercise real keyboarding. Run the
dev server and verify the component visually:

1. Start the frontend dev server:
   ```
   pnpm --filter frontend dev
   ```
2. Open `http://localhost:5173/` (or whatever port Vite picks). Sign in as
   a user with sysadmin permissions.
3. **No route renders the editor yet** (per the design: no form bindings in
   v1). To exercise the component, temporarily mount it in an unused
   authenticated page — the easiest spot is the dashboard at
   `apps/frontend/src/pages/dashboard/ui/DashboardPage.tsx`. Add a smoke
   block at the bottom of the JSX:

   ```tsx
   {/* DELETE BEFORE COMMIT — local smoke for the rich text editor */}
   <div className="mt-8 max-w-2xl">
     <RichTextEditor
       value={emptyDelta()}
       onChange={() => {}}
       placeholder="Try typing here…"
       ariaLabel="Smoke test"
     />
     <div className="mt-4 border border-border rounded p-2">
       <QuillViewer value={emptyDelta()} />
     </div>
   </div>
   ```

   plus the import:

   ```tsx
   import { RichTextEditor, QuillViewer, emptyDelta } from '@/shared/ui';
   ```

4. In the browser, confirm by hand:
   - The toolbar renders with the configured buttons (H picker, bold,
     italic, lists, blockquote, inline code, link, clear).
   - The toolbar visually matches the rest of the admin UI (MD3 colours,
     not snow's default blue/grey).
   - Typing text works; selecting and clicking **B** bolds; clicking the
     heading picker and choosing H2 promotes the line.
   - The link toolip popover renders in a themed container (not white
     with a grey border).
   - The editor body shows a themed focus outline on click.
   - Dark mode (if you have a toggle) keeps the toolbar legible.
   - The viewer underneath renders without a border or toolbar.
5. **Revert the smoke block** — remove the temporary import and JSX from
   `DashboardPage.tsx` before continuing.

- [ ] **Step 6: Confirm clean working tree**

```
git status --short
```

Expected: empty — no leftover smoke code from Step 5. If anything is
modified, revert it.

- [ ] **Step 7: Tag the work as done**

This task has no commit of its own. If the previous six tasks all
committed cleanly, the feature is complete. The full task list:

- Task 1: `chore(frontend): add react-quill-new + quill for rich text editor`
- Task 2: `feat(rich-text): Delta type re-export + emptyDelta / isEmpty helpers`
- Task 3: `feat(rich-text): snow theme + MD3 token overrides`
- Task 4: `feat(rich-text): QuillViewer — read-only Delta renderer`
- Task 5: `feat(rich-text): RichTextEditor with Standard toolbar + Delta value contract`
- Task 6: `feat(rich-text): slice barrel + re-export from shared/ui top barrel`

Six commits total. Tasks 1–6 ship the feature; Task 7 verifies.

---

## Notes

- **No form bindings shipped here.** When a future task wants to bind the
  editor to a real form, it follows the canonical RHF + Zod pattern (Plan
  B/C precedent) using RHF's `<Controller>` to wire `value` + `onChange`.
  Storage migration (text column holding stringified Delta JSON) is decided
  at that point.
- **Bundle size warning is expected.** Quill is the largest single dep we've
  added; the spec accepts the trade-off in §10. If public-page TTI becomes
  measurable later, the spec's risk-mitigation path is a `LazyQuillViewer`
  variant.
- **Dark mode.** The MD3 tokens used in `rich-text.css` are theme-aware, so
  the editor follows the app's light/dark switch automatically. No explicit
  `.dark` selector required.
- **No DOMPurify added.** Per spec §6 — Quill renders the Delta itself; we
  never call `dangerouslySetInnerHTML` on anything Quill produces. The
  formats allowlist (`FORMATS`) is the sanitisation surface.
- **i18n.** Component is i18n-agnostic. Callers pass `placeholder` and
  `ariaLabel` via `t('...')` at the call site.
