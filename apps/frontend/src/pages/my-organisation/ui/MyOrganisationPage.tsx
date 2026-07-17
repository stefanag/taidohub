import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useMyMembershipsQuery } from '@/entities/me';
import { displayName, listOrganisationsQueryOptions } from '@/entities/organisation';
import { OrgMembershipManager } from '@/features/org-membership-manager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

/**
 * Orgadmin-facing self-service page. Lists the organisations the caller can
 * orgadmin (derived from `useMyMembershipsQuery`) and mounts the
 * `<OrgMembershipManager>` for the active one.
 *
 * Layout rules:
 * - Zero orgadmin orgs → friendly empty state. Sidebar gating should keep
 *   the entry hidden in that case, but the page renders a safe fallback for
 *   direct navigation.
 * - Exactly one → mount the manager directly without a tab strip.
 * - Two or more → tab strip across the top, one tab per org, each pane
 *   mounting an independent manager.
 *
 * Display names come from the orgs list query. While the org-list response
 * is in flight we fall back to the raw id to avoid blocking render.
 */
export function MyOrganisationPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const { data: memberships = [] } = useMyMembershipsQuery();
  const { data: orgListResp } = useQuery(listOrganisationsQueryOptions());

  const orgadminOrgs = React.useMemo(
    () =>
      memberships
        .filter((m) => m.role === 'orgadmin')
        .map((m) => m.organisationId),
    [memberships],
  );

  const orgIndex = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const org of orgListResp?.data ?? []) {
      map.set(org.id, displayName(org, i18n.language));
    }
    return map;
  }, [orgListResp, i18n.language]);

  const labelFor = React.useCallback(
    (id: string): string => orgIndex.get(id) ?? id,
    [orgIndex],
  );

  // User's last picked org, or (if none picked yet) the first org they admin.
  // Derived inline: on first render orgadminOrgs may still be loading, so
  // pickedOrgId can be null; effectiveOrgId falls back to the first available
  // when it exists. The previous setState-in-effect version did the same
  // thing with an extra render pass.
  const [pickedOrgId, setPickedOrgId] = React.useState<string | null>(null);
  const activeOrgId = pickedOrgId ?? orgadminOrgs[0] ?? null;
  const setActiveOrgId = setPickedOrgId;

  if (orgadminOrgs.length === 0) {
    return (
      <main className="container py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('myOrganisation.title', { defaultValue: 'My organisation' })}
        </h1>
        <p className="mt-2 text-on-surface-variant">
          {t('myOrganisation.empty', {
            defaultValue:
              'You do not currently administer any organisations.',
          })}
        </p>
      </main>
    );
  }

  if (orgadminOrgs.length === 1) {
    const id = orgadminOrgs[0]!;
    return (
      <main className="container py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('myOrganisation.title', { defaultValue: 'My organisation' })}
        </h1>
        <p className="mt-2 mb-6 text-on-surface-variant">
          {t('myOrganisation.description', {
            defaultValue:
              'Manage the instructors and administrators of your organisation.',
          })}
        </p>
        <OrgMembershipManager organisationId={id} orgLabel={labelFor(id)} />
      </main>
    );
  }

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('myOrganisation.title', { defaultValue: 'My organisation' })}
      </h1>
      <p className="mt-2 mb-6 text-on-surface-variant">
        {t('myOrganisation.description', {
          defaultValue:
            'Manage the instructors and administrators of your organisation.',
        })}
      </p>
      <Tabs
        value={activeOrgId ?? orgadminOrgs[0]!}
        onValueChange={(value) => setActiveOrgId(value)}
      >
        <TabsList>
          {orgadminOrgs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {labelFor(id)}
            </TabsTrigger>
          ))}
        </TabsList>
        {orgadminOrgs.map((id) => (
          <TabsContent key={id} value={id}>
            <OrgMembershipManager organisationId={id} orgLabel={labelFor(id)} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
