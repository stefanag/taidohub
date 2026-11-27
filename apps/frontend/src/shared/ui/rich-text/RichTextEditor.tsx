import * as React from 'react';
import { useTranslation } from 'react-i18next';
import ReactQuill from 'react-quill-new';

import { registerTableIcons } from './table-icons.js';

import type { Delta } from './delta.js';
import type Quill from 'quill';

import { cn } from '@/shared/lib/utils';

/**
 * `standard`: the locked set from the design spec (bold, italic, H2/H3,
 * lists, blockquote, inline code, link, clear) — profile texts and the like.
 * `document`: for longer documents such as terms and privacy notices — more
 * heading levels, underline and strike-through, indentation, alignment and
 * simple tables.
 */
export type RichTextToolbar = 'standard' | 'document';

export interface RichTextEditorProps {
  value: Delta;
  onChange: (next: Delta) => void;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  className?: string;
  id?: string;
  toolbar?: RichTextToolbar;
}

const TABLE_ACTIONS = [
  'table',
  'table-row',
  'table-column',
  'table-row-delete',
  'table-column-delete',
  'table-delete',
] as const;

const TOOLBARS: Record<RichTextToolbar, unknown[]> = {
  standard: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'code'],
    ['link'],
    ['clean'],
  ],
  document: [
    [{ header: [1, 2, 3, 4, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['blockquote', 'link'],
    [...TABLE_ACTIONS],
    ['clean'],
  ],
};

const STANDARD_FORMATS = ['header', 'bold', 'italic', 'list', 'blockquote', 'code', 'link'];

/** Every format a document may contain; also what the viewer must render. */
export const DOCUMENT_FORMATS = [
  ...STANDARD_FORMATS,
  'underline',
  'strike',
  'indent',
  'align',
  'table',
  'table-row',
  'table-body',
  'table-container',
];

type TableModule = {
  insertTable(rows: number, columns: number): void;
  insertRowBelow(): void;
  insertColumnRight(): void;
  deleteRow(): void;
  deleteColumn(): void;
  deleteTable(): void;
};

/** Toolbar handlers for the table buttons; `this` is Quill's toolbar module. */
const TABLE_HANDLERS: Record<(typeof TABLE_ACTIONS)[number], (this: { quill: Quill }) => void> = {
  table() {
    (this.quill.getModule('table') as TableModule).insertTable(3, 3);
  },
  'table-row'() {
    (this.quill.getModule('table') as TableModule).insertRowBelow();
  },
  'table-column'() {
    (this.quill.getModule('table') as TableModule).insertColumnRight();
  },
  'table-row-delete'() {
    (this.quill.getModule('table') as TableModule).deleteRow();
  },
  'table-column-delete'() {
    (this.quill.getModule('table') as TableModule).deleteColumn();
  },
  'table-delete'() {
    (this.quill.getModule('table') as TableModule).deleteTable();
  },
};

/** Button class → i18n key for its tooltip. */
const BUTTON_TITLES: [string, string][] = [
  ['.ql-bold', 'richText.bold'],
  ['.ql-italic', 'richText.italic'],
  ['.ql-underline', 'richText.underline'],
  ['.ql-strike', 'richText.strike'],
  ['.ql-list[value="ordered"]', 'richText.orderedList'],
  ['.ql-list[value="bullet"]', 'richText.bulletList'],
  ['.ql-indent[value="-1"]', 'richText.outdent'],
  ['.ql-indent[value="+1"]', 'richText.indent'],
  ['.ql-blockquote', 'richText.quote'],
  ['.ql-code', 'richText.code'],
  ['.ql-link', 'richText.link'],
  ['.ql-clean', 'richText.clean'],
  ['.ql-table', 'richText.table.insert'],
  ['.ql-table-row', 'richText.table.addRow'],
  ['.ql-table-column', 'richText.table.addColumn'],
  ['.ql-table-row-delete', 'richText.table.deleteRow'],
  ['.ql-table-column-delete', 'richText.table.deleteColumn'],
  ['.ql-table-delete', 'richText.table.delete'],
];

/** Heading picker values → i18n keys (Quill shows English labels otherwise). */
const HEADING_LABELS: [string, string][] = [
  ['1', 'richText.heading1'],
  ['2', 'richText.heading2'],
  ['3', 'richText.heading3'],
  ['4', 'richText.heading4'],
  ['', 'richText.normal'],
];

/**
 * Translates the toolbar: tooltips on the buttons, and the labels of the
 * heading picker through Quill's own `data-label` attribute.
 */
function labelToolbar(container: HTMLElement, t: (key: string) => string): void {
  for (const [selector, key] of BUTTON_TITLES) {
    container.querySelectorAll<HTMLElement>(`button${selector}`).forEach((el) => {
      el.title = t(key);
      el.setAttribute('aria-label', t(key));
    });
  }
  const picker = container.querySelector('.ql-picker.ql-header');
  if (!picker) return;
  for (const [value, key] of HEADING_LABELS) {
    const selector = value
      ? `.ql-picker-item[data-value="${value}"]`
      : '.ql-picker-item:not([data-value])';
    picker.querySelectorAll(selector).forEach((el) => el.setAttribute('data-label', t(key)));
  }
  const label = picker.querySelector('.ql-picker-label');
  const current = label?.getAttribute('data-value') ?? '';
  const match = HEADING_LABELS.find(([value]) => value === current);
  if (label && match) label.setAttribute('data-label', t(match[1]));
  label?.setAttribute('title', t('richText.textStyle'));
}

/**
 * Reusable rich text editor. Stores content as a Quill `Delta` and emits a
 * new Delta on every change. `toolbar` picks the tool set (see
 * {@link RichTextToolbar}).
 *
 * Caller-supplied labels (`placeholder`, `ariaLabel`) are passed through
 * verbatim; the toolbar's own tooltips and heading names are translated here.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  readOnly,
  className,
  id,
  toolbar = 'standard',
}: RichTextEditorProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const ref = React.useRef<ReactQuill>(null);
  if (toolbar === 'document') registerTableIcons();

  const modules = React.useMemo(
    () =>
      toolbar === 'document'
        ? { toolbar: { container: TOOLBARS.document, handlers: TABLE_HANDLERS }, table: true }
        : { toolbar: TOOLBARS.standard },
    [toolbar],
  );

  React.useEffect(() => {
    const container = (
      ref.current?.getEditor().getModule('toolbar') as { container?: HTMLElement } | undefined
    )?.container;
    if (container) labelToolbar(container, t);
  }, [t, i18n.language, toolbar]);

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
        ref={ref}
        value={value}
        onChange={handleChange}
        readOnly={readOnly === true}
        theme="snow"
        {...(placeholder !== undefined && { placeholder })}
        modules={modules}
        formats={toolbar === 'document' ? DOCUMENT_FORMATS : STANDARD_FORMATS}
      />
    </div>
  );
}
