'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

import { cn } from '@/shared/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Wrapper around react-day-picker v10. Sets the library's CSS variables so the
 * calendar adopts the project's brand tokens (navy selected day, gold today
 * accent, MD3-surface backgrounds) rather than its default palette.
 */
function Calendar({
  className,
  style,
  ...props
}: CalendarProps): React.ReactElement {
  return (
    <DayPicker
      className={cn('p-3', className)}
      style={{
        // Selected day: brand primary.
        ['--rdp-accent-color' as string]: 'var(--color-primary)',
        ['--rdp-accent-background-color' as string]: 'var(--color-primary)',
        // Day-button text + caption.
        ['--rdp-today-color' as string]: 'var(--color-secondary)',
        // Surface tones.
        ['--rdp-background-color' as string]: 'transparent',
        ['--rdp-range_middle-background-color' as string]:
          'var(--color-surface-container)',
        ...style,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
