import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@/entities/belt-rank';
import type { GradingHistoryRow } from '@/entities/rank-history';
import type { ShogoTitle } from '@/entities/shogo-title';

import { GradingTimelineEntry } from './GradingTimelineEntry.js';

export interface GradingTimelineProps {
  /**
   * Rows to render. The component re-sorts internally: primary key is the
   * rank's `sortOrder` DESC (highest belt on top), with date DESC as the
   * tiebreaker when several entries share the same rank (e.g. a re-take
   * of a failed attempt).
   */
  entries: GradingHistoryRow[];
  rankMap: Map<string, BeltRank>;
  systemCodeMap: Map<string, string>;
  shogoTitleMap: Map<string, ShogoTitle>;
  /**
   * User whose grading history this is — required for the per-row
   * `<FeedbackThreadSheet>`. When undefined the feedback trigger is
   * hidden (e.g. tests, future read-only embeds).
   */
  subjectUserId?: string;
  onEdit?: (entry: GradingHistoryRow) => void;
  onVerify?: (id: string) => void;
  onUnverify?: (id: string) => void;
}

/**
 * Vertical timeline of grading entries. Re-sorts on every render (cheap; the
 * list is short) — highest rank on top, oldest at the bottom. Within a single
 * rank the newest attempt comes first. The current-rank pass index is
 * computed once and passed down so one row gets full-opacity styling.
 */
export function GradingTimeline({
  entries,
  rankMap,
  systemCodeMap,
  shogoTitleMap,
  subjectUserId,
  onEdit,
  onVerify,
  onUnverify,
}: GradingTimelineProps): React.ReactElement {
  const { t } = useTranslation();
  const sorted = React.useMemo(
    () =>
      [...entries].sort((a, b) => {
        // Rank sortOrder DESC (top of ladder first). Rows whose rank is
        // missing from the map sink to the bottom.
        const aRank = rankMap.get(a.rankId)?.sortOrder ?? -Infinity;
        const bRank = rankMap.get(b.rankId)?.sortOrder ?? -Infinity;
        if (aRank !== bRank) return bRank - aRank;
        // Same rank → newer date first (a re-take of a fail lands above the fail).
        return b.date.localeCompare(a.date);
      }),
    [entries, rankMap],
  );

  if (sorted.length === 0) {
    return (
      <p className="py-8 text-sm text-on-surface-variant">
        {t('gradingHistory.timeline.noEntriesYet', { defaultValue: 'No entries yet.' })}
      </p>
    );
  }

  // With the rank-DESC then date-DESC sort, the first pass in the list is
  // the user's current top rank (the highest belt they've passed).
  const latestPassIdx = sorted.findIndex((e) => e.result === 'pass');

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-6 top-0 w-px bg-outline-variant/25" />
      <div className="space-y-0">
        {sorted.map((entry, i) => (
          <GradingTimelineEntry
            key={entry.id}
            entry={entry}
            rank={rankMap.get(entry.rankId)}
            systemCodeMap={systemCodeMap}
            shogoTitleMap={shogoTitleMap}
            isLatest={i === latestPassIdx}
            {...(subjectUserId !== undefined ? { subjectUserId } : {})}
            {...(onEdit !== undefined ? { onEdit } : {})}
            {...(onVerify !== undefined ? { onVerify } : {})}
            {...(onUnverify !== undefined ? { onUnverify } : {})}
          />
        ))}
      </div>
    </div>
  );
}
