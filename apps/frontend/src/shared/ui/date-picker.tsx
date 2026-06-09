'use client';

import { format, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useDateFnsLocale } from '@/shared/lib/date-fns-locale.js';
import { Button } from '@/shared/ui/button';
import { Calendar } from '@/shared/ui/calendar';
import { cn } from '@/shared/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';

const ISO_DATE = 'yyyy-MM-dd';
const DISPLAY = 'PP'; // e.g. "Dec 10, 1990" — locale-aware

export interface DatePickerProps {
  /** ISO date string `YYYY-MM-DD`. Empty string or undefined renders the placeholder. */
  value: string | undefined;
  onChange: (next: string) => void;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Override the placeholder copy. Defaults to t('common.pickDate'). */
  placeholder?: string;
  className?: string;
}

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO_DATE, new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Calendar-popover date input. Replaces native `<input type="date">` for
 * consistent cross-browser UX. Emits ISO `YYYY-MM-DD` strings via `onChange`
 * so existing form schemas (`DateStringSchema`, etc.) accept the value
 * unchanged.
 */
export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  placeholder,
  className,
  ...rest
}: DatePickerProps): React.ReactElement {
  const { t } = useTranslation();
  const dateFnsLocale = useDateFnsLocale();
  const [open, setOpen] = React.useState(false);
  const selected = parseIsoDate(value);
  const displayText = selected
    ? format(selected, DISPLAY, { locale: dateFnsLocale })
    : (placeholder ?? t('common.pickDate'));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={rest['aria-label']}
          className={cn(
            'w-full justify-start text-left',
            selected ? 'font-semibold text-primary' : 'font-normal text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" aria-hidden />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) onChange(format(d, ISO_DATE));
            setOpen(false);
          }}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
        />
      </PopoverContent>
    </Popover>
  );
}
