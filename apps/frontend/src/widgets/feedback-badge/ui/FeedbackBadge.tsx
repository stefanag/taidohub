import { Bell } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useFeedbackUnreadCountQuery } from '@/entities/feedback';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { Button } from '@/shared/ui';

/**
 * Top-bar bell icon with an unread-count pill. Hidden entirely when the
 * `instructor-feedback` feature flag is off — both as a UX courtesy
 * (no point dangling a control that can't open anything) and to avoid
 * the 60-second poll against a 404 endpoint.
 *
 * The endpoint is cheap (one COUNT(DISTINCT) per role branch) but we
 * still tick at 60 s; `refetchOnWindowFocus` (TanStack default) does
 * the snappy-update work on tab activation.
 */
export function FeedbackBadge(): React.ReactElement | null {
  const { t } = useTranslation();
  const flagOn = useFeatureFlag('instructor-feedback');
  const { data } = useFeedbackUnreadCountQuery();

  if (!flagOn) return null;

  const raw = data?.count ?? 0;
  const display = raw > 99 ? '99+' : String(raw);
  const aria =
    raw === 0
      ? t('feedback.title')
      : t('feedback.unreadCount', { count: raw, defaultValue: '{{count}} unread' });

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={aria}
      className="relative"
    >
      <Bell className="size-5" aria-hidden />
      {raw > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-4 text-on-error"
          aria-hidden
        >
          {display}
        </span>
      ) : null}
    </Button>
  );
}
