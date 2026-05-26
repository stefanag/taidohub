import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listMembershipsQueryOptions } from '@/entities/membership';
import { displayName, listOrganisationsQueryOptions, type Organisation } from '@/entities/organisation';

export interface ClubCardProps {
  /** The user whose primary club is displayed. */
  userId: string;
  className?: string;
}

/**
 * ClubCard — the right-rail companion on `/grading-history` and on the admin
 * grading-history tab. Renders the user's primary club (the first `type='club'`
 * membership; if none, the first membership of any type) and the parent
 * federation's name. Pure presentational once the two queries resolve.
 *
 * Ported visually from the Taidopass `components/history/ClubCard.tsx`; the
 * MD3 surface-container-high / on-surface-variant tokens are the same ones
 * already used by the dashboard cards (see `apps/frontend/src/shared/ui/card.tsx`).
 */
export function ClubCard({ userId, className }: ClubCardProps): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const membershipsQuery = useQuery(listMembershipsQueryOptions({ userId }));
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  if (membershipsQuery.isPending || orgsQuery.isPending) {
    return (
      <aside
        className={[
          'rounded-sm bg-surface-container-high p-7 text-sm text-on-surface-variant',
          className ?? '',
        ].join(' ')}
      >
        {t('common.loading')}
      </aside>
    );
  }

  const memberships = membershipsQuery.data?.data ?? [];
  if (memberships.length === 0) return null;

  const allOrgs = orgsQuery.data?.data ?? [];
  const orgById = new Map<string, Organisation>(allOrgs.map((o) => [o.id, o]));

  // Prefer a club membership when present; otherwise take the first row.
  const primary =
    memberships.find((m) => orgById.get(m.organisationId)?.type === 'club') ?? memberships[0];
  if (!primary) return null;

  const club = orgById.get(primary.organisationId);
  if (!club) return null;

  const parent = club.parentId ? orgById.get(club.parentId) ?? null : null;
  const orgName = displayName(club, i18n.language);
  const parentName = parent ? displayName(parent, i18n.language) : null;

  return (
    <aside className={['rounded-sm bg-surface-container-high p-7', className ?? ''].join(' ')}>
      <h4 className="mb-4 text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-on-surface-variant">
        {t('gradingHistory.clubCard.heading', { defaultValue: 'Club' })}
      </h4>
      <div className="text-sm font-bold tracking-tight text-on-surface">{orgName}</div>
      {parentName ? <div className="mt-1 text-sm text-on-surface-variant">{parentName}</div> : null}
    </aside>
  );
}
