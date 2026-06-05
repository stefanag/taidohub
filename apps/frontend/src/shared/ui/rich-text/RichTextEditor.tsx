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
    <div className={cn(className)} id={id} aria-label={ariaLabel}>
      <ReactQuill
        value={value}
        onChange={handleChange}
        readOnly={readOnly === true}
        theme="snow"
        {...(placeholder !== undefined && { placeholder })}
        modules={modules}
        formats={FORMATS}
      />
    </div>
  );
}
