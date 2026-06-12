import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ProgressStatus } from '@repo/contracts/progress';

import { cn } from '@/shared/lib/utils';

const STATUS_LABEL_KEY: Record<ProgressStatus, string> = {
  not_started: 'progress.status.notStarted',
  learning: 'progress.status.learning',
  competent: 'progress.status.competent',
  grading_ready: 'progress.status.gradingReady',
};

/**
 * Per-status colour palette. All four MD3 "*-container" token pairs are
 * defined in `app/styles/globals.css` (verified 2026-06-12) so no Tailwind
 * fallback is needed.
 */
const STATUS_CLASS: Record<ProgressStatus, string> = {
  not_started:
    'border border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-container',
  learning:
    'bg-primary-container text-on-primary-container hover:bg-primary-container/80',
  competent:
    'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80',
  grading_ready:
    'bg-tertiary-container text-on-tertiary-container hover:bg-tertiary-container/80',
};

export interface ProgressPillProps {
  /** null is rendered as 'not_started' (no progress row exists yet). */
  status: ProgressStatus | null;
  onClick: () => void;
  size?: 'xs' | 'sm';
  className?: string;
}

export function ProgressPill({
  status,
  onClick,
  size = 'sm',
  className,
}: ProgressPillProps): React.ReactElement {
  const { t } = useTranslation();
  const effective: ProgressStatus = status ?? 'not_started';
  const sizeClass = size === 'xs' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        sizeClass,
        STATUS_CLASS[effective],
        className,
      )}
      aria-label={`${t('progress.title')}: ${t(STATUS_LABEL_KEY[effective])}`}
    >
      {t(STATUS_LABEL_KEY[effective])}
    </button>
  );
}
