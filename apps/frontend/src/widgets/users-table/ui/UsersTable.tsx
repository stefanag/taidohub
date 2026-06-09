import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { User } from '@/entities/user';

import { ImpersonateActionButton } from '@/features/user-impersonation';
import { Badge } from '@/shared/ui';

export interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
}

/**
 * Flat user list. Each row is clickable and opens the edit form. Columns:
 * email, name, role badge, status badge, actions. MD3 brand tokens throughout.
 *
 * The actions cell stops click propagation so the Impersonate button doesn't
 * also trigger the row's onEdit handler.
 */
export function UsersTable({ users, onEdit }: UsersTableProps): React.ReactElement {
  const { t } = useTranslation();

  if (users.length === 0) {
    return (
      <p className="text-on-surface-variant">
        {t('admin.users.empty', { defaultValue: 'No users found.' })}
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-xs uppercase text-on-surface-variant">
        <tr>
          <th className="px-2 py-2">{t('admin.users.fields.email', { defaultValue: 'Email' })}</th>
          <th className="px-2 py-2">{t('admin.users.fields.name', { defaultValue: 'Name' })}</th>
          <th className="px-2 py-2">{t('admin.users.fields.role', { defaultValue: 'Role' })}</th>
          <th className="px-2 py-2">{t('admin.users.fields.status', { defaultValue: 'Status' })}</th>
          <th className="px-2 py-2 sr-only">
            {t('admin.users.fields.actions', { defaultValue: 'Actions' })}
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr
            key={u.id}
            onClick={() => onEdit(u)}
            className="cursor-pointer border-b hover:bg-surface-container-low/50"
          >
            <td className="px-2 py-2">{u.email}</td>
            <td className="px-2 py-2">{u.name ?? '—'}</td>
            <td className="px-2 py-2">
              <Badge variant={u.role === 'sysadmin' ? 'default' : 'secondary'}>
                {t(`admin.users.roles.${u.role}`, { defaultValue: u.role })}
              </Badge>
            </td>
            <td className="px-2 py-2">
              {u.deactivatedAt ? (
                <Badge variant="outline">
                  {t('admin.users.status.deactivated', { defaultValue: 'Deactivated' })}
                </Badge>
              ) : (
                <span className="text-on-surface-variant">
                  {t('admin.users.status.active', { defaultValue: 'Active' })}
                </span>
              )}
            </td>
            <td
              className="px-2 py-2 text-right"
              onClick={(e) => e.stopPropagation()}
            >
              <ImpersonateActionButton user={u} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
