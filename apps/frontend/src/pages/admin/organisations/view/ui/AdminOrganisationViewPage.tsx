import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { IsoAlpha3 } from '@repo/contracts/organisations';

import {
  countryAlpha2,
  countryName,
  displayName,
  listOrganisationsQueryOptions,
  organisationQueryOptions,
  useDeleteOrganisation,
  useUpdateOrganisation,
} from '@/entities/organisation';
import { OrganisationDeleteDialog } from '@/features/organisation-delete-dialog';
import { OrganisationMoveDialog } from '@/features/organisation-move-dialog';
import { OrgMembershipManager } from '@/features/org-membership-manager';
import { formatDate } from '@/i18n/formatters';
import { Badge, Button } from '@/shared/ui';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet.js';

type DialogMode = 'idle' | 'move' | 'delete';

/**
 * Sysadmin-only "view organisation" page. Loads the row by id; renders a
 * read-only summary, an audit footer (createdAt / updatedAt / parent),
 * and the usual action set (Edit / Move / Delete / Manage members).
 * Move and Delete trigger the existing inline dialogs; Members opens the
 * sheet drawer.
 */
export function AdminOrganisationViewPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { organisationId } = useParams({
    from: '/_app/admin/organisations/$organisationId',
  });

  const orgQuery = useQuery(organisationQueryOptions(organisationId));
  const orgsListQuery = useQuery(listOrganisationsQueryOptions());

  const [dialog, setDialog] = React.useState<DialogMode>('idle');
  const [showMembers, setShowMembers] = React.useState(false);

  const updateMut = useUpdateOrganisation({
    onSuccess: () => setDialog('idle'),
  });
  const deleteMut = useDeleteOrganisation({
    onSuccess: () => {
      setDialog('idle');
      void navigate({ to: '/admin/organisations' });
    },
  });

  const allOrgs = orgsListQuery.data?.data ?? [];
  const orgsById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const o of allOrgs) m.set(o.id, displayName(o, i18n.language));
    return m;
  }, [allOrgs, i18n.language]);
  const childCount = React.useMemo(
    () => allOrgs.filter((o) => o.parentId === organisationId).length,
    [allOrgs, organisationId],
  );

  const onBack = (): void => {
    void navigate({ to: '/admin/organisations' });
  };
  const onEdit = (): void => {
    void navigate({
      to: '/admin/organisations/$organisationId/edit',
      params: { organisationId },
    });
  };

  if (orgQuery.isPending) {
    return (
      <main className="container max-w-3xl py-8">
        <p className="text-on-surface-variant">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      </main>
    );
  }

  const org = orgQuery.data;
  if (!org) {
    return (
      <main className="container max-w-3xl py-8">
        <p className="text-on-surface-variant">
          {t('admin.organisations.notFound', {
            defaultValue: 'Organisation not found.',
          })}{' '}
          <button
            type="button"
            onClick={onBack}
            className="text-primary underline hover:no-underline"
          >
            {t('admin.organisations.backToList', { defaultValue: 'Back to list' })}
          </button>
        </p>
      </main>
    );
  }

  const typeKey =
    org.type === 'international_federation'
      ? 'internationalFederation'
      : org.type === 'national_federation'
        ? 'nationalFederation'
        : 'club';
  const parentName = org.parentId ? (orgsById.get(org.parentId) ?? org.parentId) : '—';

  // Eligible parents for the Move dialog = every org EXCEPT this one (a
  // proper descendant-exclude needs the full tree; for the view page we
  // skip that complexity — the form's edit page enforces the same rule
  // via the same backend validation).
  const moveCandidates = allOrgs.filter((o) => o.id !== org.id);

  return (
    <main className="container max-w-3xl py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {displayName(org, i18n.language)}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            <Badge variant="outline" className="mr-2 font-mono">
              {org.shortCode}
            </Badge>
            <Badge variant="outline">
              {t(`admin.organisations.types.${typeKey}`, { defaultValue: org.type })}
            </Badge>
            {org.country ? (
              <Badge variant="secondary" className="ml-2 inline-flex items-center gap-1 font-mono">
                {(() => {
                  const alpha2 = countryAlpha2(org.country as IsoAlpha3);
                  return alpha2 ? (
                    <span
                      className={`fi fi-${alpha2}`}
                      aria-label={countryName(org.country as IsoAlpha3, i18n.language)}
                    />
                  ) : null;
                })()}
                {org.country}
              </Badge>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            {t('admin.organisations.backToList', { defaultValue: 'Back to list' })}
          </Button>
          <Button onClick={onEdit}>{t('common.edit')}</Button>
          <Button variant="outline" onClick={() => setDialog('move')}>
            {t('admin.organisations.actions.move', { defaultValue: 'Move…' })}
          </Button>
          <Button variant="outline" onClick={() => setShowMembers(true)}>
            {t('admin.organisations.actions.members', {
              defaultValue: 'Members…',
            })}
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialog('delete')}
            disabled={deleteMut.isPending}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-on-surface-variant">
          {t('admin.organisations.fields.parent', { defaultValue: 'Parent' })}
        </dt>
        <dd>{parentName}</dd>

        {org.slug ? (
          <>
            <dt className="text-on-surface-variant">
              {t('admin.organisations.fields.slug', { defaultValue: 'Slug' })}
            </dt>
            <dd className="font-mono text-xs">{org.slug}</dd>
          </>
        ) : null}

        {org.nameEn ? (
          <>
            <dt className="text-on-surface-variant">EN</dt>
            <dd>{org.nameEn}</dd>
          </>
        ) : null}
        {org.nameSv ? (
          <>
            <dt className="text-on-surface-variant">SV</dt>
            <dd>{org.nameSv}</dd>
          </>
        ) : null}
        {org.nameFi ? (
          <>
            <dt className="text-on-surface-variant">FI</dt>
            <dd>{org.nameFi}</dd>
          </>
        ) : null}
        {org.nameJa ? (
          <>
            <dt className="text-on-surface-variant">JA</dt>
            <dd lang="ja">{org.nameJa}</dd>
          </>
        ) : null}

        {org.contactEmail ? (
          <>
            <dt className="text-on-surface-variant">
              {t('admin.organisations.fields.contactEmail', {
                defaultValue: 'Contact email',
              })}
            </dt>
            <dd>
              <a className="text-primary hover:underline" href={`mailto:${org.contactEmail}`}>
                {org.contactEmail}
              </a>
            </dd>
          </>
        ) : null}
        {org.address ? (
          <>
            <dt className="text-on-surface-variant">
              {t('admin.organisations.fields.address', { defaultValue: 'Address' })}
            </dt>
            <dd className="whitespace-pre-wrap">{org.address}</dd>
          </>
        ) : null}
        {org.logoUrl ? (
          <>
            <dt className="text-on-surface-variant">
              {t('admin.organisations.fields.logoUrl', { defaultValue: 'Logo URL' })}
            </dt>
            <dd>
              <a className="text-primary hover:underline" href={org.logoUrl} target="_blank" rel="noreferrer">
                {org.logoUrl}
              </a>
            </dd>
          </>
        ) : null}
      </dl>

      <footer className="mt-8 border-t border-outline-variant pt-4 text-xs text-on-surface-variant">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          <dt>{t('admin.audit.createdAt', { defaultValue: 'Created' })}</dt>
          <dd>{formatDate(org.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt>{t('admin.audit.updatedAt', { defaultValue: 'Last updated' })}</dt>
          <dd>{formatDate(org.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt>{t('admin.audit.parent', { defaultValue: 'Parent organisation' })}</dt>
          <dd>{parentName}</dd>
        </dl>
      </footer>

      {dialog === 'move' ? (
        <OrganisationMoveDialog
          organisation={org}
          candidates={moveCandidates}
          open
          onOpenChange={(open) => {
            if (!open) setDialog('idle');
          }}
          onConfirm={async (parentId) => {
            await updateMut.mutateAsync({
              id: org.id,
              input: { parentId },
            });
          }}
        />
      ) : null}

      {dialog === 'delete' ? (
        <OrganisationDeleteDialog
          organisation={org}
          childCount={childCount}
          open
          onOpenChange={(open) => {
            if (!open) setDialog('idle');
          }}
          onConfirm={async () => {
            await deleteMut.mutateAsync(org.id);
          }}
        />
      ) : null}

      <Sheet open={showMembers} onOpenChange={setShowMembers}>
        <SheetContent side="right" className="w-[480px] sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {t('admin.organisations.memberships.sheetTitle', {
                defaultValue: 'Members of {{org}}',
                org: displayName(org, i18n.language),
              })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <OrgMembershipManager
              organisationId={org.id}
              orgLabel={displayName(org, i18n.language)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
