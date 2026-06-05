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
