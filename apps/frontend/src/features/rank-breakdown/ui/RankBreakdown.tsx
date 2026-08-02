import * as React from 'react';

import type { StatsRankRow } from '@repo/contracts/statistics';

export interface RankBreakdownProps {
  ranks: StatsRankRow[];
}

/**
 * Sorted list of rank -> member count. Sorting is done here (not trusted
 * from the caller) because the wire order is not guaranteed to match
 * `rank.sortOrder`.
 */
export function RankBreakdown({ ranks }: RankBreakdownProps): React.ReactElement {
  const sorted = React.useMemo(
    () => [...ranks].sort((a, b) => a.rank.sortOrder - b.rank.sortOrder),
    [ranks],
  );

  return (
    <ul className="divide-y divide-outline-variant">
      {sorted.map(({ rank, count }) => (
        <li key={rank.id} className="flex items-center gap-3 py-2">
          {/* TODO: enrich StatsRankRow.rank with .visuals so we can colour by belt */}
          <span className="h-4 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span className="flex-1 text-sm">
            <span className="font-medium">{rank.nameRomaji}</span>{' '}
            <span className="text-on-surface-variant">{rank.nameEn}</span>
          </span>
          <span className="text-sm font-semibold tabular-nums">{count}</span>
        </li>
      ))}
    </ul>
  );
}
