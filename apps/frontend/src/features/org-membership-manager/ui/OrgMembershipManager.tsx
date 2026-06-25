import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listMembershipsQueryOptions,
  useCreateMembership,
  useDeleteMembership,
  type MembershipRole,
  type OrganisationMembership,
} from '@/entities/membership';
import { useSession } from '@/features/auth-by-email';
import { HttpError } from '@/shared/api';
import { AbilityContext } from '@/shared/lib/casl';
import { Button } from '@/shared/ui';

import { OrgMembershipEditor } from './OrgMembershipEditor.js';

export interface OrgMembershipManagerProps {
  organisationId: string;
  orgLabel: string;
}

const CANDIDATE_ROLES: readonly MembershipRole[] = ['orgadmin', 'instructor', 'student'];

/**
 * Org-scope members table for an organisation: lists all current memberships
 * (one row per role), gates Add + Remove by the caller's CASL ability, and
 * surfaces the LAST_ORGADMIN soft-block by re-issuing the delete with
 * `confirm: true`.
 *
 * Self-protection: an actor never sees a Remove button on their own
 * `orgadmin` row in the org being managed. CASL allows sysadmin to delete
 * other orgadmins, but the UI hides the action on the actor's own row to
 * prevent accidental lockout.
 */
export function OrgMembershipManager({
  organisationId,
  orgLabel,
}: OrgMembershipManagerProps): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const actorId = session.data?.user?.id ?? '';
  const ability = React.useContext(AbilityContext);

  const { data, isPending } = useQuery(
    listMembershipsQueryOptions({ organisationId }),
  );
  const rows: OrganisationMembership[] = data?.data ?? [];

  const create = useCreateMembership();
  const remove = useDeleteMembership();

  const [adding, setAdding] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | undefined>();
  const [lastOrgadminConfirm, setLastOrgadminConfirm] = React.useState<{
    membershipId: string;
  } | null>(null);

  // What roles the actor may create in THIS org. The ability evaluates the
  // instance shape `{ __caslSubjectType__: 'OrganisationMembership', ... }`.
  const allowedRoles = React.useMemo<readonly MembershipRole[]>(() => {
    if (!ability) return [];
    return CANDIDATE_ROLES.filter((role) =>
      ability.can('create', {
        __caslSubjectType__: 'OrganisationMembership' as const,
        organisationId,
        role,
      }),
    );
  }, [ability, organisationId]);

  const canAdd = allowedRoles.length > 0;

  const handleAdd = async (
    userId: string,
    role: MembershipRole,
  ): Promise<void> => {
    setActionError(undefined);
    await create.mutateAsync({ userId, organisationId, role });
    setAdding(false);
  };

  const handleRemove = async (
    membershipId: string,
    confirmFlag = false,
  ): Promise<void> => {
    setActionError(undefined);
    try {
      await remove.mutateAsync(
        confirmFlag ? { id: membershipId, confirm: true } : { id: membershipId },
      );
    } catch (err: unknown) {
      if (isLastOrgadminError(err)) {
        setLastOrgadminConfirm({ membershipId });
        return;
      }
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t('admin.organisations.memberships.title', {
            defaultValue: 'Members of {{org}}',
            org: orgLabel,
          })}
        </h3>
        {canAdd ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t('admin.organisations.memberships.add', {
              defaultValue: 'Add member',
            })}
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-sm text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {t('admin.organisations.memberships.empty', {
            defaultValue: 'No members yet.',
          })}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-on-surface-variant">
              <th className="py-2">
                {t('admin.organisations.memberships.userColumn', {
                  defaultValue: 'User',
                })}
              </th>
              <th className="py-2">
                {t('admin.users.memberships.role', { defaultValue: 'Role' })}
              </th>
              <th className="py-2 text-right sr-only">
                {t('admin.users.fields.actions', { defaultValue: 'Actions' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isOwnOrgadminRow =
                m.userId === actorId && m.role === 'orgadmin';
              const canDelete =
                !!ability &&
                ability.can('delete', {
                  __caslSubjectType__: 'OrganisationMembership' as const,
                  organisationId: m.organisationId,
                  role: m.role,
                });
              const displayLabel = m.userName ?? m.userEmail ?? m.userId;
              return (
                <tr key={m.id} className="border-b">
                  <td className="py-2">
                    <div className="font-medium">{displayLabel}</div>
                    {m.userName && m.userEmail ? (
                      <div className="text-xs text-on-surface-variant">{m.userEmail}</div>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {t(`admin.users.roles.${m.role}`, { defaultValue: m.role })}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {canDelete && !isOwnOrgadminRow ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              t('admin.organisations.memberships.confirmRemove', {
                                defaultValue: 'Remove this member?',
                              }),
                            )
                          ) {
                            void handleRemove(m.id);
                          }
                        }}
                      >
                        {t('admin.users.memberships.remove', {
                          defaultValue: 'Remove',
                        })}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {actionError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {actionError}
        </p>
      ) : null}

      <OrgMembershipEditor
        open={adding}
        onOpenChange={setAdding}
        allowedRoles={allowedRoles}
        submitting={create.isPending}
        onConfirm={handleAdd}
      />

      {lastOrgadminConfirm ? (
        <ConfirmLastOrgadmin
          onCancel={() => setLastOrgadminConfirm(null)}
          onConfirm={async () => {
            const id = lastOrgadminConfirm.membershipId;
            setLastOrgadminConfirm(null);
            await handleRemove(id, true);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The backend returns 409 with `error.code === 'LAST_ORGADMIN'` when deleting
 * an `orgadmin` membership would leave the org with zero orgadmins.
 * `httpClient` wraps this as `HttpError`.
 */
function isLastOrgadminError(err: unknown): boolean {
  return (
    err instanceof HttpError &&
    err.status === 409 &&
    err.payload.code === 'LAST_ORGADMIN'
  );
}

function ConfirmLastOrgadmin({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.organisations.memberships.lastOrgadminTitle', {
        defaultValue: 'Confirm last-orgadmin removal',
      })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="rounded bg-background p-4 shadow-lg max-w-md">
        <p className="mb-3 text-sm">
          {t('admin.organisations.memberships.lastOrgadminWarning', {
            defaultValue:
              'This is the only org administrator. Removing them leaves the org without any admin. Proceed anyway?',
          })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="destructive" onClick={() => void onConfirm()}>
            {t('admin.organisations.memberships.lastOrgadminProceed', {
              defaultValue: 'Remove anyway',
            })}
          </Button>
        </div>
      </div>
    </div>
  );
}
