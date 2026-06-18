import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  buildTree,
  listOrganisationsQueryOptions,
  type Organisation,
  type OrganisationNode,
  organisationQueryOptions,
  useUpdateOrganisation,
} from '@/entities/organisation';
import { OrganisationForm } from '@/features/organisation-form';
import { Button } from '@/shared/ui';

/**
 * Sysadmin-only "edit organisation" page. Loads the row + the full org
 * list (for the parent picker), then renders `OrganisationForm` in edit
 * mode. The parent picker excludes this org and its descendants so the
 * user can't introduce a cycle. On save → navigate to view; on cancel →
 * navigate to view (least-surprising back behaviour).
 */
export function AdminOrganisationEditPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organisationId } = useParams({
    from: '/_app/admin/organisations/$organisationId/edit',
  });

  const orgQuery = useQuery(organisationQueryOptions(organisationId));
  const orgsListQuery = useQuery(listOrganisationsQueryOptions());
  const updateMut = useUpdateOrganisation({
    onSuccess: () => {
      void navigate({
        to: '/admin/organisations/$organisationId',
        params: { organisationId },
      });
    },
  });

  const toView = (): void => {
    void navigate({
      to: '/admin/organisations/$organisationId',
      params: { organisationId },
    });
  };

  const allOrgs = orgsListQuery.data?.data ?? [];
  const tree = React.useMemo(() => buildTree(allOrgs), [allOrgs]);
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

  const parentCandidates = React.useMemo<Organisation[]>(() => {
    if (!orgQuery.data) return allOrgs;
    const node = treeById.get(orgQuery.data.id);
    if (!node) return allOrgs.filter((r) => r.id !== orgQuery.data!.id);
    const exclude = descendantIds(node);
    return allOrgs.filter((r) => !exclude.has(r.id));
  }, [allOrgs, orgQuery.data, treeById]);

  return (
    <main className="container max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.organisations.actions.edit', { defaultValue: 'Edit organisation' })}
        </h1>
        <Button variant="outline" onClick={toView}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>

      {orgQuery.isPending ? (
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : orgQuery.data ? (
        <OrganisationForm
          mode="edit"
          initialValues={orgQuery.data}
          parentCandidates={parentCandidates}
          submitting={updateMut.isPending}
          onSubmit={async (values) => {
            await updateMut.mutateAsync({
              id: orgQuery.data!.id,
              input: values,
            });
          }}
        />
      ) : (
        <p className="text-on-surface-variant">
          {t('admin.organisations.notFound', {
            defaultValue: 'Organisation not found.',
          })}
        </p>
      )}
    </main>
  );
}

function descendantIds(node: OrganisationNode): Set<string> {
  const set = new Set<string>([node.id]);
  for (const child of node.children) {
    for (const id of descendantIds(child)) set.add(id);
  }
  return set;
}
