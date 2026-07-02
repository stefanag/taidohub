import { zodResolver } from '@hookform/resolvers/zod';
import { CreateRequirementSetSchema, type RequirementSet } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { z } from 'zod';

import { useMyMembershipsQuery } from '@/entities/me';
import { displayName, listOrganisationsQueryOptions } from '@/entities/organisation';
import {
  useActivateRequirementSetMutation,
  useCloneRequirementSetMutation,
  useCreateRequirementSetMutation,
  useDeactivateRequirementSetMutation,
  useDeleteRequirementSetMutation,
  useRequirementSetsQuery,
  useUpdateRequirementSetMutation,
} from '@/entities/requirement-set';
import { useSession } from '@/features/auth-by-email';
import { HttpError } from '@/shared/api';
import { AbilityContext } from '@/shared/lib/casl';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Input,
  Label,
  ResourceAdminListPage,
} from '@/shared/ui';

/** Today's date as an ISO `YYYY-MM-DD` string, in the local timezone. */
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type CreateFormValues = z.input<typeof CreateRequirementSetSchema>;

/** Which dialog/flow is currently active. */
type PageMode =
  | { kind: 'idle' }
  | { kind: 'edit'; set: RequirementSet }
  | { kind: 'clone'; set: RequirementSet }
  | { kind: 'delete'; set: RequirementSet };

/**
 * Admin page for managing `RequirementSet` records: an inline create form
 * plus a list of every set the actor can see, each row exposing
 * Activate/Deactivate/Clone/Edit/Delete actions.
 *
 * Visibility is gated on `manage RequirementSet` — either sysadmin
 * (`ability.can('manage', 'all')`) or an org-scoped orgadmin/instructor
 * membership, mirroring how the sidebar decides to show org-scoped entries
 * (the frontend CASL ability only models the sysadmin wildcard; org-scoped
 * roles come from `useMyMembershipsQuery`, same as `AppSidebar`).
 */
export function AdminRequirementSetsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const ability = React.useContext(AbilityContext);
  const session = useSession();
  const role = (session.data?.user as { role?: string } | undefined)?.role;
  const isSysadmin = role === 'sysadmin' || ability?.can('manage', 'all') === true;

  const { data: memberships = [] } = useMyMembershipsQuery();
  const adminOrgIds = React.useMemo(
    () =>
      memberships
        .filter((m) => m.role === 'orgadmin' || m.role === 'instructor')
        .map((m) => m.organisationId),
    [memberships],
  );
  const canManage = isSysadmin || adminOrgIds.length > 0;

  const { data: sets = [], isLoading } = useRequirementSetsQuery();
  const { data: orgsData } = useQuery(listOrganisationsQueryOptions());
  const orgsById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgsData?.data ?? []) map.set(o.id, displayName(o, i18n.language));
    return map;
  }, [orgsData, i18n.language]);

  const createMut = useCreateRequirementSetMutation();
  const activateMut = useActivateRequirementSetMutation();
  const deactivateMut = useDeactivateRequirementSetMutation();
  const cloneMut = useCloneRequirementSetMutation();
  const deleteMut = useDeleteRequirementSetMutation();
  const updateMut = useUpdateRequirementSetMutation();

  const [mode, setMode] = React.useState<PageMode>({ kind: 'idle' });
  const [cloneName, setCloneName] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);

  const defaultOrgId = isSysadmin ? null : (adminOrgIds[0] ?? null);

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(CreateRequirementSetSchema),
    defaultValues: {
      name: '',
      effectiveDate: todayIso(),
      organisationId: defaultOrgId,
    },
  });

  React.useEffect(() => {
    createForm.setValue('organisationId', defaultOrgId);
  }, [defaultOrgId, createForm]);

  const [createError, setCreateError] = React.useState<string | undefined>();

  const editForm = useForm<{ name: string; effectiveDate: string }>({
    defaultValues: { name: '', effectiveDate: '' },
  });
  const [editError, setEditError] = React.useState<string | undefined>();

  const onCreateSubmit = createForm.handleSubmit(async (values) => {
    setCreateError(undefined);
    const parsed = CreateRequirementSetSchema.parse(values);
    try {
      await createMut.mutateAsync(parsed);
      createForm.reset({
        name: '',
        effectiveDate: todayIso(),
        organisationId: defaultOrgId,
      });
      setCreateOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof HttpError ? err.message : t('common.unknownError'),
      );
    }
  });

  const onCloneConfirm = async (): Promise<void> => {
    if (mode.kind !== 'clone') return;
    await cloneMut.mutateAsync({
      id: mode.set.id,
      input: cloneName.trim() ? { name: cloneName.trim() } : {},
    });
    setMode({ kind: 'idle' });
    setCloneName('');
  };

  const onDeleteConfirm = async (): Promise<void> => {
    if (mode.kind !== 'delete') return;
    await deleteMut.mutateAsync(mode.set.id);
    setMode({ kind: 'idle' });
  };

  if (!canManage) {
    return (
      <main className="container py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.requirementSets.title')}
        </h1>
      </main>
    );
  }

  return (
    <ResourceAdminListPage
      title={t('admin.requirementSets.title')}
      description={t('admin.requirementSets.description')}
      newAction={{
        label: t('admin.requirementSets.newSet'),
        onClick: () => setCreateOpen(true),
      }}
    >
      {isLoading ? (
        <p className="text-on-surface-variant">{t('common.loading')}</p>
      ) : sets.length === 0 ? (
        <p className="text-on-surface-variant">{t('admin.requirementSets.empty')}</p>
      ) : (
        <ul className="space-y-2" data-testid="requirement-set-list">
          {sets.map((row) => {
            const orgLabel = row.organisationId
              ? (orgsById.get(row.organisationId) ?? row.organisationId)
              : t('admin.requirementSets.organisationGlobal');
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-outline-variant p-4"
                data-testid={`requirement-set-row-${row.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    <Badge variant={row.isActive ? 'default' : 'outline'}>
                      {row.isActive
                        ? t('admin.requirementSets.active')
                        : t('admin.requirementSets.inactive')}
                    </Badge>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {orgLabel} · {row.effectiveDate}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {row.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deactivateMut.isPending}
                      onClick={() => deactivateMut.mutate(row.id)}
                    >
                      {t('admin.requirementSets.deactivate')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activateMut.isPending}
                      onClick={() => activateMut.mutate(row.id)}
                    >
                      {t('admin.requirementSets.activate')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCloneName('');
                      setMode({ kind: 'clone', set: row });
                    }}
                  >
                    {t('admin.requirementSets.clone')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      editForm.reset({ name: row.name, effectiveDate: row.effectiveDate });
                      setEditError(undefined);
                      setMode({ kind: 'edit', set: row });
                    }}
                  >
                    {t('admin.requirementSets.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setMode({ kind: 'delete', set: row })}
                  >
                    {t('admin.requirementSets.delete')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.requirementSets.newSet')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreateSubmit} className="space-y-4" noValidate>
            <FormField>
              <Label htmlFor="rs-name">{t('admin.requirementSets.name')}</Label>
              <Input id="rs-name" {...createForm.register('name')} />
              <FormMessage message={createForm.formState.errors.name?.message} />
            </FormField>
            <FormField>
              <Label htmlFor="rs-effective-date">
                {t('admin.requirementSets.effectiveDate')}
              </Label>
              <Input
                id="rs-effective-date"
                type="date"
                {...createForm.register('effectiveDate')}
              />
              <FormMessage message={createForm.formState.errors.effectiveDate?.message} />
            </FormField>
            <FormMessage message={createError} />
            <DialogFooter>
              <Button type="submit" disabled={createMut.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={mode.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.requirementSets.editTitle')}</DialogTitle>
          </DialogHeader>
          {mode.kind === 'edit' ? (
            <EditRequirementSetForm
              key={mode.set.id}
              form={editForm}
              error={editError}
              onSubmit={async (input) => {
                setEditError(undefined);
                try {
                  await updateMut.mutateAsync({ id: mode.set.id, input });
                  setMode({ kind: 'idle' });
                } catch (err) {
                  setEditError(
                    err instanceof HttpError ? err.message : t('common.unknownError'),
                  );
                }
              }}
              onCancel={() => setMode({ kind: 'idle' })}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Clone dialog */}
      <Dialog
        open={mode.kind === 'clone'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.requirementSets.cloneTitle')}</DialogTitle>
          </DialogHeader>
          <FormField>
            <Label htmlFor="rs-clone-name">{t('admin.requirementSets.clonePrompt')}</Label>
            <Input
              id="rs-clone-name"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              disabled={cloneMut.isPending}
              onClick={() => void onCloneConfirm()}
            >
              {t('admin.requirementSets.clone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={mode.kind === 'delete'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.requirementSets.delete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            {t('admin.requirementSets.deleteConfirm')}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => void onDeleteConfirm()}
            >
              {t('admin.requirementSets.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResourceAdminListPage>
  );
}

interface EditRequirementSetFormProps {
  form: ReturnType<typeof useForm<{ name: string; effectiveDate: string }>>;
  error: string | undefined;
  onSubmit: (input: { name: string; effectiveDate: string }) => Promise<void>;
  onCancel: () => void;
}

function EditRequirementSetForm({
  form,
  error,
  onSubmit,
  onCancel,
}: EditRequirementSetFormProps): React.ReactElement {
  const { t } = useTranslation();
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="rs-edit-name">{t('admin.requirementSets.name')}</Label>
        <Input id="rs-edit-name" {...form.register('name')} />
      </FormField>
      <FormField>
        <Label htmlFor="rs-edit-effective-date">
          {t('admin.requirementSets.effectiveDate')}
        </Label>
        <Input id="rs-edit-effective-date" type="date" {...form.register('effectiveDate')} />
      </FormField>
      <FormMessage message={error} />
      <DialogFooter>
        <Button type="submit">{t('common.save')}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </DialogFooter>
    </form>
  );
}
