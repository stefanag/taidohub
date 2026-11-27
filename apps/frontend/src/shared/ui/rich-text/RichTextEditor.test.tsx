import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { emptyDelta, type Delta } from './delta.js';
import { RichTextEditor } from './RichTextEditor.js';

import i18n from '@/i18n';

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

describe('<RichTextEditor toolbar="document">', () => {
  it('offers more heading levels, more formatting and table tools', () => {
    const { container } = render(
      <RichTextEditor value={emptyDelta()} onChange={vi.fn()} toolbar="document" />,
    );
    const values = Array.from(container.querySelectorAll('.ql-header .ql-picker-item')).map((el) =>
      el.getAttribute('data-value'),
    );
    expect(values).toEqual(['1', '2', '3', '4', null]);
    for (const name of ['underline', 'strike', 'indent', 'align', 'table', 'table-row', 'table-column', 'table-delete']) {
      expect(container.querySelector(`.ql-toolbar .ql-${name}`), name).not.toBeNull();
    }
    expect(container.querySelector('.ql-toolbar .ql-table-row svg')).not.toBeNull();
  });

  it('names the toolbar in the interface language', async () => {
    await i18n.changeLanguage('sv');
    const { container } = render(
      <RichTextEditor value={emptyDelta()} onChange={vi.fn()} toolbar="document" />,
    );
    expect(container.querySelector('.ql-header .ql-picker-item[data-value="1"]')?.getAttribute('data-label')).toBe(
      'Rubrik 1',
    );
    expect(container.querySelector<HTMLButtonElement>('button.ql-table')?.title).toBe('Infoga tabell (3 × 3)');
    await i18n.changeLanguage('en');
  });

  it('inserts a table', async () => {
    const onChange = vi.fn();
    const { container } = render(<RichTextEditor value={emptyDelta()} onChange={onChange} toolbar="document" />);
    container.querySelector<HTMLButtonElement>('button.ql-table')!.click();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    const delta = onChange.mock.calls.at(-1)![0] as Delta;
    // One newline per cell carries the table attribute; Quill merges a row's cells into one op.
    const cells = delta.ops
      .filter((op) => op.attributes?.table)
      .reduce((n, op) => n + (typeof op.insert === 'string' ? op.insert.length : 0), 0);
    expect(cells).toBe(9);
  });

  it('keeps the standard toolbar unchanged', () => {
    const { container } = render(<RichTextEditor value={emptyDelta()} onChange={vi.fn()} />);
    expect(container.querySelector('.ql-toolbar .ql-table')).toBeNull();
    expect(container.querySelector('.ql-toolbar .ql-underline')).toBeNull();
  });
});
