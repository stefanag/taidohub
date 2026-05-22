import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listUsersQueryOptions,
  useDeactivateUser,
  useDeleteUser,
  useReactivateUser,
  useSendPasswordReset,
  useUpdateUser,
  type ListUsersQuery,
  type User,
} from '@/entities/user';
import { useSession } from '@/features/auth-by-email';
import { InviteUserDialog } from '@/features/invite-user-dialog';
import { UserDeleteDialog } from '@/features/user-delete-dialog';
import { UserForm } from '@/features/user-form';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';
import { UsersFilters } from '@/widgets/users-filters';
import { UsersTable } from '@/widgets/users-table';

const INITIAL_QUERY: ListUsersQuery = { deactivated: 'false', page: 1, perPage: 25 };

/** Which dialog/flow is currently active. */
type PageMode =
  | { kind: 'idle' }
  | { kind: 'edit'; user: User }
  | { kind: 'invite' }
  | { kind: 'delete'; user: User };

/**
 * Admin page for managing user accounts: filter the list, invite new users,
 * open a user to edit name/role/memberships, run lifecycle actions, and
 * hard-delete behind a typed-email confirmation. A discriminated-union state
 * machine picks which dialog is open.
 */
export function AdminUsersPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? '';

  const [query, setQuery] = React.useState<ListUsersQuery>(INITIAL_QUERY);
  const [mode, setMode] = React.useState<PageMode>({ kind: 'idle' });

  const { data, isLoading, isError, error } = useQuery(listUsersQueryOptions(query));

  const updateMut = useUpdateUser({ onSuccess: () => setMode({ kind: 'idle' }) });
  const deactivateMut = useDeactivateUser();
  const reactivateMut = useReactivateUser();
  const sendResetMut = useSendPasswordReset();
  const deleteMut = useDeleteUser();

  const setPage = (page: number): void => setQuery((q) => ({ ...q, page }));
  const total = data?.total ?? 0;
  const hasNext = query.page * query.perPage < total;

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.users.title', { defaultValue: 'Users' })}
        </h1>
        <Button onClick={() => setMode({ kind: 'invite' })}>
          {t('admin.users.actions.invite', { defaultValue: 'Invite user' })}
        </Button>
      </div>

      <div className="mb-6">
        <UsersFilters value={query} onChange={setQuery} />
      </div>

      {isLoading ? (
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : isError ? (
        <p className="text-error">
          {error instanceof Error
            ? error.message
            : t('common.unknownError', { defaultValue: 'Unknown error' })}
        </p>
      ) : (
        <>
          <UsersTable
            users={data?.data ?? []}
            onEdit={(u) => setMode({ kind: 'edit', user: u })}
          />

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={query.page <= 1}
              onClick={() => setPage(query.page - 1)}
            >
              {t('admin.users.pager.prev', { defaultValue: 'Previous' })}
            </Button>
            <span className="text-sm text-on-surface-variant">
              {t('admin.users.pager.page', { defaultValue: 'Page {{page}}', page: query.page })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage(query.page + 1)}
            >
              {t('admin.users.pager.next', { defaultValue: 'Next' })}
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={mode.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('admin.users.actions.edit', { defaultValue: 'Edit' })}
            </DialogTitle>
          </DialogHeader>
          {mode.kind === 'edit' ? (
            <UserForm
              key={mode.user.id}
              user={mode.user}
              currentUserId={currentUserId}
              submitting={updateMut.isPending}
              onSubmit={async (input) => {
                await updateMut.mutateAsync({ id: mode.user.id, input });
              }}
              onDeactivate={async () => {
                await deactivateMut.mutateAsync(mode.user.id);
              }}
              onReactivate={async () => {
                await reactivateMut.mutateAsync(mode.user.id);
              }}
              onSendPasswordReset={async () => {
                await sendResetMut.mutateAsync(mode.user.id);
              }}
              onDelete={() => setMode({ kind: 'delete', user: mode.user })}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <InviteUserDialog
        open={mode.kind === 'invite'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      />

      {mode.kind === 'delete' ? (
        <UserDeleteDialog
          user={mode.user}
          open
          onOpenChange={(open) => {
            if (!open) setMode({ kind: 'idle' });
          }}
          onConfirm={async () => {
            await deleteMut.mutateAsync(mode.user.id);
            setMode({ kind: 'idle' });
          }}
        />
      ) : null}
    </main>
  );
}
