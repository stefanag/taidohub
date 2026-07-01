import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { Pattern } from '@repo/contracts/patterns';
import type { Technique } from '@repo/contracts/techniques';

import { useSession } from '@/entities/me';
import { usePatternsQuery } from '@/entities/pattern';
import { useProgressListQuery } from '@/entities/progress';
import { useRequirementsQuery } from '@/entities/rank-requirement';
import { useTechniquesQuery } from '@/entities/technique';

import { NextRankCard, useNextRank } from '@/features/next-rank-card';
import { RankRequirementsDisplay } from '@/features/rank-requirements-display';

/**
 * Student-facing progression page: `<NextRankCard />` (compact progress
 * summary) at the top, followed by the full `<RankRequirementsDisplay />`
 * for the actor's next rank. Both derive `nextRank` from the same
 * `useNextRank` hook (Task 22) so the two sections never disagree on which
 * rank is "next".
 *
 * When the actor is already at the highest rank (`nextRank` is null once
 * resolved), only the card renders — it shows its own "highest rank" empty
 * state — and the detailed requirements section is omitted entirely.
 */
export function ProgressionPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const userId = session.data?.user?.id ?? '';

  const { nextRank, isPending: rankPending, isError: rankError } = useNextRank(userId);

  const requirementsQuery = useRequirementsQuery(nextRank?.id ?? null);
  const techniquesQuery = useTechniquesQuery();
  const patternsQuery = usePatternsQuery();
  const techProgressQuery = useProgressListQuery('technique');
  const patProgressQuery = useProgressListQuery('pattern');

  const lookup = React.useMemo(() => {
    const techniques = new Map<string, Technique>();
    for (const tech of techniquesQuery.data ?? []) techniques.set(tech.id, tech);
    const patterns = new Map<string, Pattern>();
    for (const pat of patternsQuery.data ?? []) patterns.set(pat.id, pat);
    return { techniques, patterns };
  }, [techniquesQuery.data, patternsQuery.data]);

  const isPending =
    rankPending ||
    (Boolean(nextRank) &&
      (requirementsQuery.isPending ||
        techniquesQuery.isPending ||
        patternsQuery.isPending ||
        techProgressQuery.isPending ||
        patProgressQuery.isPending));
  const isError =
    rankError ||
    requirementsQuery.isError ||
    techniquesQuery.isError ||
    patternsQuery.isError ||
    techProgressQuery.isError ||
    patProgressQuery.isError;

  return (
    <main className="mx-auto max-w-[900px] space-y-8 p-8">
      <header>
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
          {t('progression.title', { defaultValue: 'Progression' })}
        </h1>
      </header>

      <NextRankCard />

      {nextRank ? (
        isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('common.unknownError')}
          </p>
        ) : requirementsQuery.data ? (
          <RankRequirementsDisplay
            requirements={requirementsQuery.data}
            techProgress={techProgressQuery.data ?? []}
            patProgress={patProgressQuery.data ?? []}
            lookup={lookup}
          />
        ) : null
      ) : null}
    </main>
  );
}
