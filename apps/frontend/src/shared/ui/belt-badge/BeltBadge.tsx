import * as React from 'react';

import { cn } from '@/shared/lib/utils';

export interface BeltBadgeProps {
  /** Any valid CSS color — typically the rank's `beltColor` hex string. */
  color: string;
  /** Display label, e.g. `rankLabel(rank, lang)`. */
  label: string;
  className?: string;
}

/**
 * BeltBadge — a single-line pill with a colored dot and a label. Used in
 * compact list rows where a full `<BeltGraphic>` is too large.
 */
export function BeltBadge({ color, label, className }: BeltBadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded bg-surface-container-high px-3 py-1 text-xs font-bold text-on-surface',
        className,
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
