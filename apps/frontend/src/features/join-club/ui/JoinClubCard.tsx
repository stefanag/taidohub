import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  cancelJoinRequest,
  clubName,
  createJoinRequest,
  useJoinRequestMutation,
  useJoinableClubsQuery,
  useMyJoinRequestsQuery,
} from '@/entities/club-join-request';
import { useMyMembershipsQuery } from '@/entities/me';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { formatIsoDate } from '@/shared/lib/grading-readiness';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

const textareaClass =
  'w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary';

/**
 * For a user without a club: ask a club to let you join, or follow the
 * request you already sent. The club sees your name, e-mail, current rank
 * and message. Renders nothing for club members or with the flag off.
 */
export function JoinClubCard(): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const enabled = useFeatureFlag('club-join-requests');
  const memberships = useMyMembershipsQuery();
  const withoutClub = memberships.isSuccess && memberships.data.length === 0;
  const requests = useMyJoinRequestsQuery({ enabled: enabled && withoutClub });
  const clubs = useJoinableClubsQuery({ enabled: enabled && withoutClub });
  const create = useJoinRequestMutation(createJoinRequest);
  const cancel = useJoinRequestMutation(cancelJoinRequest);

  const [clubId, setClubId] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState(false);

  const sortedClubs = React.useMemo(
    () =>
      [...(clubs.data ?? [])].sort((a, b) =>
        clubName(a, i18n.language).localeCompare(clubName(b, i18n.language), i18n.language),
      ),
    [clubs.data, i18n.language],
  );

  if (!enabled || !withoutClub) return null;

  const latest = requests.data?.[0];
  const pending = latest?.status === 'pending' ? latest : undefined;
  const dateOf = (iso: string) => formatIsoDate(iso.slice(0, 10), i18n.language);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(false);
    create.mutate(
      { organisationId: clubId, message: message.trim() || null },
      {
        onSuccess: () => {
          setClubId('');
          setMessage('');
        },
        onError: () => setError(true),
      },
    );
  };

  return (
    <Card data-testid="join-club-card">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t('joinClub.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {requests.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : pending ? (
          <>
            <p data-testid="join-club-pending">
              {t('joinClub.pending', {
                club: clubName(pending.club, i18n.language),
                date: dateOf(pending.createdAt),
              })}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(pending.id)}
            >
              {t('joinClub.cancel')}
            </Button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            {latest?.status === 'declined' ? (
              <p role="note" className="text-on-surface-variant">
                {t('joinClub.declined', { club: clubName(latest.club, i18n.language) })}
              </p>
            ) : (
              <p className="text-on-surface-variant">{t('joinClub.intro')}</p>
            )}
            <div className="space-y-1">
              <Label htmlFor="join-club">{t('joinClub.club')}</Label>
              <Select value={clubId} onValueChange={setClubId}>
                <SelectTrigger id="join-club">
                  <SelectValue placeholder={t('joinClub.chooseClub')} />
                </SelectTrigger>
                <SelectContent>
                  {sortedClubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {clubName(c, i18n.language)} ({c.shortCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="join-message">{t('joinClub.message')}</Label>
              <textarea
                id="join-message"
                rows={3}
                maxLength={1000}
                className={textareaClass}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <p className="text-on-surface-variant">{t('joinClub.shared')}</p>
            {error ? (
              <p role="alert" className="text-destructive">
                {t('common.unknownError')}
              </p>
            ) : null}
            <Button type="submit" disabled={!clubId || create.isPending}>
              {t('joinClub.send')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
