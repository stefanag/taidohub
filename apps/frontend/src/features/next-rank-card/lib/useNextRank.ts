import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { listBeltRanksQueryOptions, type BeltRank } from '@/entities/belt-rank';
import { gradingHistoryQueryOptions } from '@/entities/rank-history';

export interface UseNextRankResult {
  /** The user's most recent passed rank, or null (no verified/pass history yet). */
  currentRank: BeltRank | null;
  /** The rank after `currentRank` in the belt system, or null when there is none (highest rank) or data is still loading. */
  nextRank: BeltRank | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

/**
 * Derives `currentRank`/`nextRank` for a user from the unified grading-history
 * projection plus the belt-ranks catalogue.
 *
 * There is no dedicated "next rank" endpoint (see Task 22 investigation), so
 * this composes two existing reads:
 *   - `gradingHistoryQueryOptions(userId)` — history rows, each carrying a
 *     `rankId` and a `date`/`result`. The current rank is the rank on the
 *     most recent `result === 'pass'` row (rows are not guaranteed sorted by
 *     the API, so we sort by `date` desc locally, mirroring `GradingTimeline`).
 *   - `listBeltRanksQueryOptions()` — the full rank catalogue, each row
 *     carrying an explicit `nextRankId` (see `BeltRank` contract). Next rank
 *     is simply `rankMap.get(currentRank.nextRankId)`.
 *
 * `nextRank` is null both while data is loading and once resolved with no
 * next rank (student at the highest rank) — callers distinguish the two via
 * `isPending`.
 */
export function useNextRank(userId: string): UseNextRankResult {
  const historyQuery = useQuery(gradingHistoryQueryOptions(userId));
  const ranksQuery = useQuery(listBeltRanksQueryOptions());

  const rankMap = React.useMemo(() => {
    const m = new Map<string, BeltRank>();
    for (const r of ranksQuery.data ?? []) m.set(r.id, r);
    return m;
  }, [ranksQuery.data]);

  const currentRank = React.useMemo<BeltRank | null>(() => {
    const rows = historyQuery.data?.data ?? [];
    const passed = rows
      .filter((row) => row.result === 'pass')
      .sort((a, b) => b.date.localeCompare(a.date));
    const latest = passed[0];
    if (!latest) return null;
    return rankMap.get(latest.rankId) ?? null;
  }, [historyQuery.data, rankMap]);

  const nextRank = React.useMemo<BeltRank | null>(() => {
    if (!currentRank?.nextRankId) return null;
    return rankMap.get(currentRank.nextRankId) ?? null;
  }, [currentRank, rankMap]);

  return {
    currentRank,
    nextRank,
    isPending: historyQuery.isPending || ranksQuery.isPending,
    isError: historyQuery.isError || ranksQuery.isError,
    error: historyQuery.error ?? ranksQuery.error,
  };
}
