import * as React from 'react';
import ReactQuill from 'react-quill-new';

import { DOCUMENT_FORMATS } from './RichTextEditor.js';

import type { Delta } from './delta.js';

import { cn } from '@/shared/lib/utils';

export interface QuillViewerProps {
  value: Delta;
  className?: string;
}

/** Everything either toolbar can produce, so documents with tables render too. */
const FORMATS = DOCUMENT_FORMATS;
const MODULES = { toolbar: false, table: true };

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
      <ReactQuill value={value} readOnly theme="snow" formats={FORMATS} modules={MODULES} />
    </div>
  );
}
