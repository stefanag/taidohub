import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@/entities/belt-rank';
import type { GradingHistoryRow } from '@/entities/rank-history';
import type { ShogoTitle } from '@/entities/shogo-title';

import { GradingTimelineEntry } from './GradingTimelineEntry.js';

export interface GradingTimelineProps {
  /** Rows to render. The component re-sorts by date DESC internally. */
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
 * list is short). The latest pass index is computed once and passed down so
 * one row gets full-opacity styling.
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
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  if (sorted.length === 0) {
    return (
      <p className="py-8 text-sm text-on-surface-variant">
        {t('gradingHistory.timeline.noEntriesYet', { defaultValue: 'No entries yet.' })}
      </p>
    );
  }

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
