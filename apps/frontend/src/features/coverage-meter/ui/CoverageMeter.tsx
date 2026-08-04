import * as React from 'react';

export interface CoverageMeterProps {
  label: string;
  pct: number;
}

/** Clamp to the valid progress range; out-of-range inputs still render a usable bar. */
function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

export function CoverageMeter({ label, pct }: CoverageMeterProps): React.ReactElement {
  const clamped = clampPct(pct);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-on-surface-variant">{clamped}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
