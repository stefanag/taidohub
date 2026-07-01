import * as React from 'react';

import { cn } from '@/shared/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Percentage complete, 0-100. Clamped defensively at render time. */
  value?: number;
}

/**
 * Minimal shadcn-style progress bar. No `@radix-ui/react-progress` dependency
 * exists in this repo yet, so this is a plain div-based track/indicator pair
 * (same visual API as the Radix primitive: `value` 0-100) rather than pulling
 * in a new package for a single bar.
 */
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-surface-container-high',
          className,
        )}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-primary transition-transform"
          style={{ transform: `translateX(-${100 - pct}%)` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';
