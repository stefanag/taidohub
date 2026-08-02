import * as React from 'react';

export interface StatTileProps {
  label: string;
  value: number;
  deltaPct?: number;
}

export function StatTile({ label, value, deltaPct }: StatTileProps): React.ReactElement {
  // Fixed to 'en-US' rather than `undefined` (host locale): this is a pure
  // props widget with no i18n import allowed (features/* import discipline
  // — see task-9 brief), and the host OS locale is not guaranteed to use
  // comma grouping (e.g. sv-SE renders "1 234"), which would make output
  // non-deterministic across environments.
  const fmt = new Intl.NumberFormat('en-US').format(value);
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
      <div className="text-xs uppercase text-on-surface-variant">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{fmt}</div>
      {typeof deltaPct === 'number' ? (
        <div className={deltaPct >= 0 ? 'text-primary text-xs mt-1' : 'text-error text-xs mt-1'}>
          {deltaPct >= 0 ? `+${deltaPct.toFixed(1)}%` : `−${Math.abs(deltaPct).toFixed(1)}%`}
        </div>
      ) : null}
    </div>
  );
}
