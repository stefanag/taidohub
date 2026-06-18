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
  useDeleteOrganisation,
  useUpdateOrganisation,
} from '@/entities/organisation';
import { LabelsFilterBar } from '@/features/labels';
import { OrganisationDeleteDialog } from '@/features/organisation-delete-dialog';
import { OrganisationMoveDialog } from '@/features/organisation-move-dialog';
import { OrgMembershipManager } from '@/features/org-membership-manager';
import { Button } from '@/shared/ui';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet.js';
import { OrganisationTree } from '@/widgets/organisation-tree';

/**
 * Admin organisations list page. Tree-based (vs flat list) because the
 * hierarchy is a first-class concern; row name click navigates to the
 * view page, and the dropdown menu retains per-row quick actions
 * (Edit, Move, Delete, Members) for power users.
 *
 *   row name click → /admin/organisations/$organisationId  (view)
 *   dropdown Edit  → /admin/organisations/$organisationId/edit
 *   dropdown Move/Delete/Members → inline dialog / sheet
 *
 * Filter state (`?tag=…&category=…`) lives in the URL via the route's
 * `validateSearch`.
 */
type DialogMode =
  | { kind: 'idle' }
  | { kind: 'move'; org: Organisation }
  | { kind: 'delete'; org: Organisation };

export function AdminOrganisationsListPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/admin/organisations/' }) as {
    tag?: string[];
    category?: string[];
  };
  const { data, isLoading, isError, error } = useQuery(
    listOrganisationsQueryOptions({
      ...(search.tag !== undefined && { tag: search.tag }),
      ...(search.category !== undefined && { category: search.category }),
    }),
  );

  const [dialog, setDialog] = React.useState<DialogMode>({ kind: 'idle' });
  const [membersFor, setMembersFor] = React.useState<
    { id: string; label: string } | null
  >(null);

  const updateMut = useUpdateOrganisation({
    onSuccess: () => setDialog({ kind: 'idle' }),
  });
  const deleteMut = useDeleteOrganisation({
    onSuccess: () => setDialog({ kind: 'idle' }),
  });

  const tree = React.useMemo(() => buildTree(data?.data ?? []), [data]);

  const childCount = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const row of data?.data ?? []) {
      if (row.parentId) m.set(row.parentId, (m.get(row.parentId) ?? 0) + 1);
    }
    return m;
  }, [data]);

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

  const handleFilterChange = (next: {
    tag?: string[];
    category?: string[];
  }): void => {
    const merged: { tag?: string[]; category?: string[] } = {
      ...(search.tag !== undefined && { tag: search.tag }),
      ...(search.category !== undefined && { category: search.category }),
      ...(next.tag !== undefined && { tag: next.tag }),
      ...(next.category !== undefined && { category: next.category }),
    };
    void navigate({ to: '/admin/organisations', search: merged });
  };

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.organisations.title', { defaultValue: 'Organisations' })}
        </h1>
        <Button onClick={() => void navigate({ to: '/admin/organisations/new' })}>
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
          onSelect={(org) =>
            void navigate({
              to: '/admin/organisations/$organisationId',
              params: { organisationId: org.id },
            })
          }
          onEdit={(org) =>
            void navigate({
              to: '/admin/organisations/$organisationId/edit',
              params: { organisationId: org.id },
            })
          }
          onMove={(org) => setDialog({ kind: 'move', org })}
          onDelete={(org) => setDialog({ kind: 'delete', org })}
          onManageMembers={(org) =>
            setMembersFor({
              id: org.id,
              label: displayName(org, i18n.language),
            })
          }
        />
      )}

      {dialog.kind === 'move' ? (
        <OrganisationMoveDialog
          organisation={dialog.org}
          candidates={candidatesFor(dialog.org)}
          open
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: 'idle' });
          }}
          onConfirm={async (parentId) => {
            await updateMut.mutateAsync({
              id: dialog.org.id,
              input: { parentId },
            });
          }}
        />
      ) : null}

      {dialog.kind === 'delete' ? (
        <OrganisationDeleteDialog
          organisation={dialog.org}
          childCount={childCount.get(dialog.org.id) ?? 0}
          open
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: 'idle' });
          }}
          onConfirm={async () => {
            await deleteMut.mutateAsync(dialog.org.id);
          }}
        />
      ) : null}

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
