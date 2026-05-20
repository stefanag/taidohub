import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  diffFields,
  listAuditLogQueryOptions,
  type AuditLogEntry,
  type ListAuditLogQuery,
} from '@/entities/audit-log';

export interface AuditLogTableProps {
  query: ListAuditLogQuery;
}

const ACTION_KEY = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  move: 'moved',
  deactivate: 'deactivated',
  reactivate: 'reactivated',
  password_reset_triggered: 'passwordResetTriggered',
} as const;

const ACTION_DEFAULTS: Record<(typeof ACTION_KEY)[keyof typeof ACTION_KEY], string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  moved: 'moved',
  deactivated: 'deactivated',
  reactivated: 'reactivated',
  passwordResetTriggered: 'password reset triggered',
};

const COLUMN_DEFAULTS = {
  when: 'When',
  who: 'Who',
  entity: 'Entity',
  action: 'Action',
  diff: 'Diff',
} as const;

export function AuditLogTable({ query }: AuditLogTableProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useQuery(listAuditLogQueryOptions(query));
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <p className="text-on-surface-variant">
        {t('common.loading', { defaultValue: 'Loading…' })}
      </p>
    );
  }
  if (isError) {
    return (
      <p className="text-error">
        {error instanceof Error
          ? error.message
          : t('common.unknownError', { defaultValue: 'unknown error' })}
      </p>
    );
  }
  if (!data || data.data.length === 0) {
    return (
      <p className="text-on-surface-variant">
        {t('admin.auditLog.empty', { defaultValue: 'No audit entries yet.' })}
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs uppercase text-on-surface-variant">
        <tr>
          <th className="w-6" />
          <th className="px-2 py-2">
            {t('admin.auditLog.columns.when', { defaultValue: COLUMN_DEFAULTS.when })}
          </th>
          <th className="px-2 py-2">
            {t('admin.auditLog.columns.who', { defaultValue: COLUMN_DEFAULTS.who })}
          </th>
          <th className="px-2 py-2">
            {t('admin.auditLog.columns.entity', { defaultValue: COLUMN_DEFAULTS.entity })}
          </th>
          <th className="px-2 py-2">
            {t('admin.auditLog.columns.action', { defaultValue: COLUMN_DEFAULTS.action })}
          </th>
          <th className="px-2 py-2">
            {t('admin.auditLog.columns.diff', { defaultValue: COLUMN_DEFAULTS.diff })}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.data.map((row) => (
          <RowAndDetail
            key={row.id}
            row={row}
            expanded={expanded.has(row.id)}
            onToggle={() => toggle(row.id)}
            locale={i18n.language}
            t={t}
          />
        ))}
      </tbody>
    </table>
  );
}

interface RowProps {
  row: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
}

function RowAndDetail({ row, expanded, onToggle, locale, t }: RowProps): React.ReactElement {
  const diff = diffFields(row.before, row.after);
  const when = new Date(row.createdAt).toLocaleString(locale);
  const actionKey = ACTION_KEY[row.action];
  const actionLabel = t(`admin.auditLog.actions.${actionKey}`, {
    defaultValue: ACTION_DEFAULTS[actionKey],
  });

  return (
    <>
      <tr className="border-b hover:bg-surface-container-low/50">
        <td>
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={onToggle}
            className="px-1"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">{when}</td>
        <td className="px-2 py-2">
          <code className="text-xs">{row.userId ?? '—'}</code>
        </td>
        <td className="px-2 py-2">
          <code className="text-xs">
            {row.entityType}:{row.entityId}
          </code>
        </td>
        <td className="px-2 py-2">{actionLabel}</td>
        <td className="px-2 py-2 text-xs text-on-surface-variant">
          +{diff.created.length} ~{diff.changed.length} -{diff.removed.length}
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-surface-container-low/30">
          <td />
          <td colSpan={5} className="px-2 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <h4 className="text-xs font-semibold mb-1">before</h4>
                <pre className="overflow-auto rounded bg-surface-container-lowest p-2 text-xs">
                  {row.before === null ? '(null)' : JSON.stringify(row.before, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-semibold mb-1">after</h4>
                <pre className="overflow-auto rounded bg-surface-container-lowest p-2 text-xs">
                  {row.after === null ? '(null)' : JSON.stringify(row.after, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
