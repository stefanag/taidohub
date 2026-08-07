import * as React from 'react';

export interface StatTileProps {
  label: string;
  value: number;
  deltaPct?: number;
  /**
   * BCP-47 locale for `Intl.NumberFormat`. Default `'en-US'` keeps output
   * deterministic when the caller doesn't supply one — features/* can't
   * import from `@/i18n` directly, so the caller (page/widget) reads
   * `i18n.resolvedLanguage` and passes it in.
   */
  locale?: string;
}

export function StatTile({
  label,
  value,
  deltaPct,
  locale = 'en-US',
}: StatTileProps): React.ReactElement {
  const fmt = new Intl.NumberFormat(locale).format(value);
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
