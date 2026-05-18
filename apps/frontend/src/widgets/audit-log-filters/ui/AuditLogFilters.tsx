import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { AuditLogAction, ListAuditLogQuery } from '@/entities/audit-log';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

export interface AuditLogFiltersProps {
  value: ListAuditLogQuery;
  onChange: (next: ListAuditLogQuery) => void;
}

const ACTION_KEY = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  move: 'moved',
} as const;

const ALL = '__all';
const ENTITY_TYPES = [ALL, 'organisation'] as const;
const ACTIONS: ReadonlyArray<typeof ALL | AuditLogAction> = [
  ALL,
  'create',
  'update',
  'delete',
  'move',
];

export function AuditLogFilters({ value, onChange }: AuditLogFiltersProps): React.ReactElement {
  const { t } = useTranslation();

  const patch = (delta: Partial<ListAuditLogQuery>): void => {
    onChange({ ...value, ...delta, page: 1 });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <FilterField
        label={t('admin.auditLog.filters.entityType', { defaultValue: 'Entity type' })}
      >
        <Select
          value={value.entityType ?? ALL}
          onValueChange={(v) => patch({ entityType: v === ALL ? undefined : v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt === ALL
                  ? t('admin.auditLog.filters.allEntities', { defaultValue: 'All entities' })
                  : t(`admin.auditLog.entityTypes.${opt}`, { defaultValue: opt })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label={t('admin.auditLog.filters.userId', { defaultValue: 'User id' })}>
        <Input
          value={value.userId ?? ''}
          onChange={(e) => patch({ userId: e.target.value || undefined })}
        />
      </FilterField>

      <FilterField label={t('admin.auditLog.filters.action', { defaultValue: 'Action' })}>
        <Select
          value={value.action ?? ALL}
          onValueChange={(v) =>
            patch({ action: v === ALL ? undefined : (v as AuditLogAction) })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt === ALL
                  ? t('admin.auditLog.filters.allActions', { defaultValue: 'All actions' })
                  : t(`admin.auditLog.actions.${ACTION_KEY[opt]}`, { defaultValue: opt })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label={t('admin.auditLog.filters.from', { defaultValue: 'From' })}>
        <input
          type="datetime-local"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={value.from ? toLocalInput(value.from) : ''}
          onChange={(e) =>
            patch({
              from: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            })
          }
        />
      </FilterField>

      <FilterField label={t('admin.auditLog.filters.to', { defaultValue: 'To' })}>
        <input
          type="datetime-local"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={value.to ? toLocalInput(value.to) : ''}
          onChange={(e) =>
            patch({
              to: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            })
          }
        />
      </FilterField>

      <div className="col-span-full">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ page: 1, perPage: value.perPage })}
        >
          {t('admin.auditLog.filters.clear', { defaultValue: 'Clear' })}
        </Button>
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Label className="space-y-1 block">
      <span className="text-xs text-on-surface-variant">{label}</span>
      {children}
    </Label>
  );
}

function toLocalInput(iso: string): string {
  // `datetime-local` wants `YYYY-MM-DDTHH:mm`, no timezone suffix.
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
