'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

import { cn } from '@/shared/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Thin wrapper around react-day-picker v10 with the library's default
 * stylesheet imported once. Theming is done via the project's CSS tokens
 * (see globals.css :where(.rdp-root) overrides if added later).
 */
function Calendar({
  className,
  ...props
}: CalendarProps): React.ReactElement {
  return <DayPicker className={cn('p-3', className)} {...props} />;
}
Calendar.displayName = 'Calendar';

export { Calendar };
