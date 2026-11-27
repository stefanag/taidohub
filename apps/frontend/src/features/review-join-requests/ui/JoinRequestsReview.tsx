import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import {
  approveJoinRequest,
  clubName,
  declineJoinRequest,
  useJoinRequestMutation,
  usePendingJoinRequestsQuery,
} from '@/entities/club-join-request';
import { useMyMembershipsQuery } from '@/entities/me';
import { AbilityContext } from '@/shared/lib/casl';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { formatIsoDate } from '@/shared/lib/grading-readiness';
import { rankLabel } from '@/shared/lib/rank-label';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/shared/ui';

/**
 * Pending requests to join the clubs where the caller is orgadmin or
 * instructor (every club for sysadmin), with approve and decline. Approving
 * makes the applicant a student; their self-reported grading history can then
 * be verified as usual. Renders nothing when there is nothing to decide.
 */
export function JoinRequestsReview(): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const enabled = useFeatureFlag('club-join-requests');
  const ability = React.useContext(AbilityContext);
  const memberships = useMyMembershipsQuery();
  const decides =
    ability?.can('manage', 'all') === true ||
    (memberships.data ?? []).some((m) => m.role === 'orgadmin' || m.role === 'instructor');
  const pending = usePendingJoinRequestsQuery({ enabled: enabled && decides });
  const ranks = useQuery({ ...listBeltRanksQueryOptions(), enabled: enabled && decides });
  const approve = useJoinRequestMutation(approveJoinRequest);
  const decline = useJoinRequestMutation(declineJoinRequest);
  const busy = approve.isPending || decline.isPending;

  if (!enabled || !decides || !pending.data || pending.data.length === 0) return null;

  const rankName = (id: string | null) => {
    const rank = id ? ranks.data?.find((r) => r.id === id) : undefined;
    return rank ? rankLabel(rank, i18n.language) : t('joinRequests.noRank');
  };

  return (
    <Card data-testid="join-requests-review">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {t('joinRequests.title', { count: pending.data.length })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4 text-sm">
          {pending.data.map((r) => (
            <li key={r.id} className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
              <p className="font-medium">
                {r.applicant.name ?? r.applicant.email}{' '}
                <span className="font-normal text-on-surface-variant">{r.applicant.email}</span>
              </p>
              <p className="text-on-surface-variant">
                {t('joinRequests.details', {
                  club: clubName(r.club, i18n.language),
                  rank: rankName(r.applicant.currentRankId),
                  date: formatIsoDate(r.createdAt.slice(0, 10), i18n.language),
                })}
              </p>
              {r.message ? <p className="whitespace-pre-wrap">{r.message}</p> : null}
              <div className="flex gap-2 pt-1">
                <Button size="sm" disabled={busy} onClick={() => approve.mutate(r.id)}>
                  {t('joinRequests.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('joinRequests.confirmDecline'))) decline.mutate(r.id);
                  }}
                >
                  {t('joinRequests.decline')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="pt-3 text-xs text-on-surface-variant">{t('joinRequests.afterApproval')}</p>
      </CardContent>
    </Card>
  );
}
