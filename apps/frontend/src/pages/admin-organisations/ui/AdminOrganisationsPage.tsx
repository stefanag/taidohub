import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  buildTree,
  displayName,
  listOrganisationsQueryOptions,
  type Organisation,
  type OrganisationNode,
  useCreateOrganisation,
  useDeleteOrganisation,
  useUpdateOrganisation,
} from '@/entities/organisation';
import { LabelsFilterBar } from '@/features/labels';
import { OrganisationDeleteDialog } from '@/features/organisation-delete-dialog';
import { OrganisationForm } from '@/features/organisation-form';
import { OrganisationMoveDialog } from '@/features/organisation-move-dialog';
import { OrgMembershipManager } from '@/features/org-membership-manager';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet.js';
import { OrganisationTree } from '@/widgets/organisation-tree';

type PageMode =
  | { kind: 'idle' }
  | { kind: 'create' }
  | { kind: 'edit'; org: Organisation }
  | { kind: 'move'; org: Organisation }
  | { kind: 'delete'; org: Organisation };

/**
 * Admin page for managing the organisation hierarchy. Pure composition: the
 * tree widget renders the list, dialogs do the editing, and the page itself
 * is a small state machine that picks which dialog is open. All data flow
 * goes through the entity's react-query hooks.
 */
export function AdminOrganisationsPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/admin/organisations' });
  const { data, isLoading, isError, error } = useQuery(
    listOrganisationsQueryOptions({
      ...(search.tag !== undefined && { tag: search.tag }),
      ...(search.category !== undefined && { category: search.category }),
    }),
  );
  const [mode, setMode] = React.useState<PageMode>({ kind: 'idle' });
  const [membersFor, setMembersFor] = React.useState<
    { id: string; label: string } | null
  >(null);

  const handleFilterChange = (next: {
    tag?: string[];
    category?: string[];
  }): void => {
    // Build the merged search-state explicitly. The route's `validateSearch`
    // owns the only two keys we care about — anything else on `search` is
    // either also-validated state we want to preserve or junk the validator
    // will drop on the next read.
    const merged: { tag?: string[]; category?: string[] } = {
      ...(search.tag !== undefined && { tag: search.tag }),
      ...(search.category !== undefined && { category: search.category }),
      ...(next.tag !== undefined && { tag: next.tag }),
      ...(next.category !== undefined && { category: next.category }),
    };
    void navigate({ to: '/admin/organisations', search: merged });
  };

  const createMut = useCreateOrganisation({
    onSuccess: () => setMode({ kind: 'idle' }),
  });
  const updateMut = useUpdateOrganisation({
    onSuccess: () => setMode({ kind: 'idle' }),
  });
  const deleteMut = useDeleteOrganisation({
    onSuccess: () => setMode({ kind: 'idle' }),
  });

  const tree = React.useMemo(() => buildTree(data?.data ?? []), [data]);

  // Flat child-count lookup for the delete dialog (so we can tell the user
  // "you must reparent N children first").
  const childCount = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const row of data?.data ?? []) {
      if (row.parentId) m.set(row.parentId, (m.get(row.parentId) ?? 0) + 1);
    }
    return m;
  }, [data]);

  // Tree-node lookup by id, for walking the descendants of the currently
  // edited org when computing legal parent candidates.
  const treeById = React.useMemo(() => {
    const m = new Map<string, OrganisationNode>();
    const walk = (nodes: OrganisationNode[]): void => {
      for (const n of nodes) {
        m.set(n.id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return m;
  }, [tree]);

  const candidatesFor = (org: Organisation | null): Organisation[] => {
    if (!org || !data) return data?.data ?? [];
    const node = treeById.get(org.id);
    if (!node) return data.data;
    const exclude = descendantIds(node);
    return data.data.filter((r) => !exclude.has(r.id));
  };

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.organisations.title', { defaultValue: 'Organisations' })}
        </h1>
        <Button onClick={() => setMode({ kind: 'create' })}>
          {t('admin.organisations.newOrganisation', {
            defaultValue: 'New organisation',
          })}
        </Button>
      </div>

      <div className="mb-4">
        <LabelsFilterBar
          searchKey={{
            ...(search.tag !== undefined && { tag: search.tag }),
            ...(search.category !== undefined && { category: search.category }),
          }}
          onChange={handleFilterChange}
        />
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
        <OrganisationTree
          nodes={tree}
          onEdit={(org) => setMode({ kind: 'edit', org })}
          onMove={(org) => setMode({ kind: 'move', org })}
          onDelete={(org) => setMode({ kind: 'delete', org })}
          onManageMembers={(org) =>
            setMembersFor({
              id: org.id,
              label: displayName(org, i18n.language),
            })
          }
        />
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={mode.kind === 'create' || mode.kind === 'edit'}
        onOpenChange={(open) => {
          if (!open) setMode({ kind: 'idle' });
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode.kind === 'edit'
                ? t('admin.organisations.actions.edit', { defaultValue: 'Edit' })
                : t('admin.organisations.newOrganisation', {
                    defaultValue: 'New organisation',
                  })}
            </DialogTitle>
          </DialogHeader>

          {mode.kind === 'create' ? (
            <OrganisationForm
              mode="create"
              parentCandidates={data?.data ?? []}
              submitting={createMut.isPending}
              onSubmit={async (values) => {
                await createMut.mutateAsync(
                  values as Parameters<typeof createMut.mutateAsync>[0],
                );
              }}
            />
          ) : mode.kind === 'edit' ? (
            <OrganisationForm
              mode="edit"
              initialValues={mode.org}
              parentCandidates={candidatesFor(mode.org)}
              submitting={updateMut.isPending}
              onSubmit={async (values) => {
                await updateMut.mutateAsync({
                  id: mode.org.id,
                  input: values,
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      {mode.kind === 'move' ? (
        <OrganisationMoveDialog
          organisation={mode.org}
          candidates={candidatesFor(mode.org)}
          open
          onOpenChange={(open) => {
            if (!open) setMode({ kind: 'idle' });
          }}
          onConfirm={async (parentId) => {
            await updateMut.mutateAsync({
              id: mode.org.id,
              input: { parentId },
            });
          }}
        />
      ) : null}

      {/* Delete dialog */}
      {mode.kind === 'delete' ? (
        <OrganisationDeleteDialog
          organisation={mode.org}
          childCount={childCount.get(mode.org.id) ?? 0}
          open
          onOpenChange={(open) => {
            if (!open) setMode({ kind: 'idle' });
          }}
          onConfirm={async () => {
            await deleteMut.mutateAsync(mode.org.id);
          }}
        />
      ) : null}

      {/* Org-scope membership manager drawer */}
      <Sheet
        open={!!membersFor}
        onOpenChange={(open) => {
          if (!open) setMembersFor(null);
        }}
      >
        <SheetContent side="right" className="w-[480px] sm:max-w-md">
          {membersFor ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {t('admin.organisations.memberships.sheetTitle', {
                    defaultValue: 'Members of {{org}}',
                    org: membersFor.label,
                  })}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <OrgMembershipManager
                  organisationId={membersFor.id}
                  orgLabel={membersFor.label}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}

/** Collects an org's id plus every descendant id; used to forbid cycles. */
function descendantIds(node: OrganisationNode): Set<string> {
  const set = new Set<string>([node.id]);
  for (const child of node.children) {
    for (const id of descendantIds(child)) set.add(id);
  }
  return set;
}
