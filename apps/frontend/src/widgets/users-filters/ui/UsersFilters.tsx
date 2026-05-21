import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ListUsersQuery } from '@/entities/user';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

export interface UsersFiltersProps {
  value: ListUsersQuery;
  onChange: (next: ListUsersQuery) => void;
}

const ALL_ROLES = '__all';

/**
 * Filter bar for the users admin table: free-text search, role select, and a
 * "show deactivated" toggle. Mirrors the audit-log-filters widget shape.
 * Every change resets `page` to 1.
 */
export function UsersFilters({ value, onChange }: UsersFiltersProps): React.ReactElement {
  const { t } = useTranslation();

  const patch = (delta: Partial<ListUsersQuery>): void => {
    onChange({ ...value, ...delta, page: 1 });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="users-search">
          {t('admin.users.searchPlaceholder', { defaultValue: 'Search by email or name' })}
        </Label>
        <Input
          id="users-search"
          value={value.q ?? ''}
          onChange={(e) => patch({ q: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="users-role">
          {t('admin.users.filters.role', { defaultValue: 'Role' })}
        </Label>
        <Select
          value={value.role ?? ALL_ROLES}
          onValueChange={(v) => patch({ role: v === ALL_ROLES ? undefined : (v as ListUsersQuery['role']) })}
        >
          <SelectTrigger id="users-role" aria-label={t('admin.users.filters.role', { defaultValue: 'Role' })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROLES}>
              {t('admin.users.filters.allRoles', { defaultValue: 'All roles' })}
            </SelectItem>
            <SelectItem value="sysadmin">
              {t('admin.users.roles.sysadmin', { defaultValue: 'System administrator' })}
            </SelectItem>
            <SelectItem value="user">
              {t('admin.users.roles.user', { defaultValue: 'User' })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.deactivated === 'all'}
            onChange={(e) => patch({ deactivated: e.target.checked ? 'all' : 'false' })}
          />
          {t('admin.users.filters.showDeactivated', { defaultValue: 'Show deactivated' })}
        </label>
      </div>
    </div>
  );
}
