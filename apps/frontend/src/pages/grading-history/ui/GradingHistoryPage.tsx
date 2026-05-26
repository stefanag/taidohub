import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions, type BeltRank } from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import { gradingHistoryQueryOptions, type GradingHistoryRow } from '@/entities/rank-history';
import { listShogoTitlesQueryOptions, type ShogoTitle } from '@/entities/shogo-title';

import { useSession } from '@/features/auth-by-email';
import { GradingTimeline } from '@/features/grading-timeline';
import { RankHistoryFormDialog } from '@/features/rank-history-form';

import { FeatureFlag, useFeatureFlag } from '@/shared/lib/feature-flags';
import { Button } from '@/shared/ui';

import { ClubCard } from '@/widgets/club-card';

import {
  useUnverifyRankHistory,
  useVerifyRankHistory,
} from '@/entities/rank-history';

/**
 * Self-service grading-history page. Two-column layout:
 *   left  = `<GradingTimeline />` over the unified projection
 *   right = `<ClubCard />` (single card for v1)
 *
 * The Add/Edit modal is shared with the admin variant (`UserForm` 4th tab) —
 * gating differs only in the source of `subjectUserId`.
 */
export function GradingHistoryPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const userId = session.data?.user?.id ?? '';

  const historyQuery = useQuery(gradingHistoryQueryOptions(userId));
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const shogoQuery = useQuery(listShogoTitlesQueryOptions());

  // The verify/unverify hooks need `subjectUserId` for cache invalidation.
  const verifyMutation = useVerifyRankHistory();
  const unverifyMutation = useUnverifyRankHistory();

  const [dialogState, setDialogState] = React.useState<
    { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; entry: GradingHistoryRow }
  >({ kind: 'closed' });

  const gradingHistoryEnabled = useFeatureFlag('grading-history');

  const rankMap = React.useMemo(() => {
    const m = new Map<string, BeltRank>();
    for (const r of ranksQuery.data ?? []) m.set(r.id, r);
    return m;
  }, [ranksQuery.data]);
  const systemCodeMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of systemsQuery.data ?? []) m.set(s.id, s.code);
    return m;
  }, [systemsQuery.data]);
  const shogoTitleMap = React.useMemo(() => {
    const m = new Map<string, ShogoTitle>();
    for (const s of shogoQuery.data ?? []) m.set(s.code, s);
    return m;
  }, [shogoQuery.data]);

  const entries = historyQuery.data?.data ?? [];

  return (
    <main className="mx-auto max-w-[1100px] space-y-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
            {t('gradingHistory.title', { defaultValue: 'Grading history' })}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
            {t('gradingHistory.description', {
              defaultValue:
                'Every grading you have recorded or that has been mirrored from an event. Add past gradings to keep the picture complete.',
            })}
          </p>
        </div>
        <FeatureFlag code="grading-history">
          <Button
            variant="default"
            size="sm"
            onClick={() => setDialogState({ kind: 'create' })}
            disabled={!userId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('gradingHistory.addPastGrading', { defaultValue: 'Add past grading' })}
          </Button>
        </FeatureFlag>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          {historyQuery.isPending ? (
            <p className="text-on-surface-variant">{t('common.loading')}</p>
          ) : historyQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {historyQuery.error instanceof Error
                ? historyQuery.error.message
                : t('common.unknownError')}
            </p>
          ) : (
            <GradingTimeline
              entries={entries}
              rankMap={rankMap}
              systemCodeMap={systemCodeMap}
              shogoTitleMap={shogoTitleMap}
              onEdit={(entry) => setDialogState({ kind: 'edit', entry })}
              onVerify={(id) => verifyMutation.mutate({ id, subjectUserId: userId })}
              onUnverify={(id) => unverifyMutation.mutate({ id, subjectUserId: userId })}
            />
          )}
        </section>

        <aside className="space-y-6">
          {userId ? <ClubCard userId={userId} /> : null}
        </aside>
      </div>

      {gradingHistoryEnabled && dialogState.kind === 'create' ? (
        <RankHistoryFormDialog
          mode="create"
          open
          onOpenChange={(o) => {
            if (!o) setDialogState({ kind: 'closed' });
          }}
          subjectUserId={userId}
        />
      ) : null}
      {gradingHistoryEnabled && dialogState.kind === 'edit' ? (
        <RankHistoryFormDialog
          mode="edit"
          open
          onOpenChange={(o) => {
            if (!o) setDialogState({ kind: 'closed' });
          }}
          subjectUserId={userId}
          entry={dialogState.entry}
        />
      ) : null}
    </main>
  );
}
