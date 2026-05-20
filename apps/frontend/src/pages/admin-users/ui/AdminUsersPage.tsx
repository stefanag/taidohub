import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth-by-email';
import {
  listUsersQueryOptions,
  useUpdateUser,
  type ListUsersQuery,
  type User,
} from '@/entities/user';
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

/**
 * Admin page for managing user accounts: filter the list, open a user, edit
 * their name/role and memberships. A small state machine picks whether the
 * edit dialog is open.
 */
export function AdminUsersPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const currentUserId = session.data?.user?.id ?? '';

  const [query, setQuery] = React.useState<ListUsersQuery>(INITIAL_QUERY);
  const [editing, setEditing] = React.useState<User | null>(null);

  const { data, isLoading, isError, error } = useQuery(listUsersQueryOptions(query));

  const updateMut = useUpdateUser({ onSuccess: () => setEditing(null) });

  const setPage = (page: number): void => setQuery((q) => ({ ...q, page }));
  const total = data?.total ?? 0;
  const hasNext = query.page * query.perPage < total;

  return (
    <main className="container py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t('admin.users.title', { defaultValue: 'Users' })}
      </h1>

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
          <UsersTable users={data?.data ?? []} onEdit={(u) => setEditing(u)} />

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
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('admin.users.actions.edit', { defaultValue: 'Edit' })}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <UserForm
              key={editing.id}
              user={editing}
              currentUserId={currentUserId}
              submitting={updateMut.isPending}
              onSubmit={async (input) => {
                await updateMut.mutateAsync({ id: editing.id, input });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
