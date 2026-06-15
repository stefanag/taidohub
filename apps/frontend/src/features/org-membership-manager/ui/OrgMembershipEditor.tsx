import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { MembershipRole } from '@/entities/membership';
import { listUsersQueryOptions } from '@/entities/user';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Label,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface OrgMembershipEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Roles the caller may grant in this org. Filtered by the caller's ability. */
  allowedRoles: readonly MembershipRole[];
  /** Called with the chosen user + role when the admin confirms. */
  onConfirm: (userId: string, role: MembershipRole) => Promise<void>;
  submitting?: boolean;
}

/**
 * Org-scope sibling of <MembershipEditor>: pick a user + role to add to
 * the org. Caller-supplied `allowedRoles` already reflects the actor's
 * ability (sysadmin: [orgadmin, instructor]; orgadmin: [instructor]).
 *
 * User search piggy-backs on `listUsersQueryOptions({ q })`. The `q` value
 * is debounced (300 ms) so each keystroke doesn't trigger a query.
 */
export function OrgMembershipEditor({
  open,
  onOpenChange,
  allowedRoles,
  onConfirm,
  submitting,
}: OrgMembershipEditorProps): React.ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 300);

  const { data } = useQuery(
    listUsersQueryOptions({
      q: debouncedSearch || undefined,
      page: 1,
      perPage: 25,
      deactivated: 'false',
    }),
  );
  const users = data?.data ?? [];

  const [userId, setUserId] = React.useState<string>('');
  const [role, setRole] = React.useState<MembershipRole>(
    allowedRoles[0] ?? 'instructor',
  );
  const [error, setError] = React.useState<string | undefined>();

  // Reset on close (mirror MembershipEditor.tsx).
  React.useEffect(() => {
    if (!open) {
      setUserId('');
      setSearch('');
      setRole(allowedRoles[0] ?? 'instructor');
      setError(undefined);
    }
  }, [open, allowedRoles]);

  // If allowedRoles changes (org context swap), make sure the selected role
  // is still legal — otherwise snap to the first allowed.
  React.useEffect(() => {
    if (!allowedRoles.includes(role) && allowedRoles[0]) {
      setRole(allowedRoles[0]);
    }
  }, [allowedRoles, role]);

  const handleConfirm = async (): Promise<void> => {
    setError(undefined);
    if (!userId) {
      setError(
        t('admin.organisations.memberships.userRequired', {
          defaultValue: 'Please select a user.',
        }),
      );
      return;
    }
    try {
      await onConfirm(userId, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.organisations.memberships.add', {
              defaultValue: 'Add member',
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField>
            <Label htmlFor="org-membership-search">
              {t('admin.organisations.memberships.searchUser', {
                defaultValue: 'Search user',
              })}
            </Label>
            <input
              id="org-membership-search"
              type="text"
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder={t('admin.organisations.memberships.searchPlaceholder', {
                defaultValue: 'Email or name',
              })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FormField>

          <FormField>
            <Label htmlFor="org-membership-user">
              {t('admin.organisations.memberships.user', { defaultValue: 'User' })}
            </Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger
                id="org-membership-user"
                aria-label={t('admin.organisations.memberships.user', {
                  defaultValue: 'User',
                })}
              >
                <SelectValue
                  placeholder={t('admin.organisations.memberships.userPlaceholder', {
                    defaultValue: 'Select a user',
                  })}
                />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ? `${u.name} — ${u.email}` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="org-membership-role">
              {t('admin.users.memberships.role', { defaultValue: 'Role' })}
            </Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as MembershipRole)}
            >
              <SelectTrigger
                id="org-membership-role"
                aria-label={t('admin.users.memberships.role', {
                  defaultValue: 'Role',
                })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`admin.users.roles.${r}`, { defaultValue: r })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormMessage message={error} />

          <Button onClick={() => void handleConfirm()} disabled={submitting}>
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
