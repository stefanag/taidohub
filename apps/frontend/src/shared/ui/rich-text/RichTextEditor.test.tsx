import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RichTextEditor } from './RichTextEditor.js';
import { emptyDelta, type Delta } from './delta.js';

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
