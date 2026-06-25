import { useNavigate } from '@tanstack/react-router';
import { Bell, Inbox } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useFeedbackInboxQuery,
  useFeedbackUnreadCountQuery,
  type FeedbackInboxItem,
} from '@/entities/feedback';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { Button } from '@/shared/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet.js';

/**
 * Top-bar bell icon with an unread-count pill. Clicking opens a Sheet
 * with the list of threads that have unread activity (lazy-fetched —
 * the inbox endpoint is only hit while the sheet is open).
 *
 * Each row links the user to the student detail page so they can dive
 * straight to the relevant context. Hidden entirely when the
 * `instructor-feedback` feature flag is off — both as a UX courtesy
 * and to avoid the 60-second poll against a 404 endpoint.
 */
export function FeedbackBadge(): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const flagOn = useFeatureFlag('instructor-feedback');
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  const { data } = useFeedbackUnreadCountQuery();
  const inboxQ = useFeedbackInboxQuery(open);

  if (!flagOn) return null;

  const raw = data?.count ?? 0;
  const display = raw > 99 ? '99+' : String(raw);
  const aria =
    raw === 0
      ? t('feedback.title')
      : t('feedback.unreadCount', { count: raw, defaultValue: '{{count}} unread' });

  const items = inboxQ.data ?? [];

  const navigateTo = (item: FeedbackInboxItem): void => {
    setOpen(false);
    // Grading items deep-link to the row anchor on the student detail
    // page so the timeline scrolls to the right entry. Other types
    // just land on the student page; their per-row triggers live
    // inside the techniques/patterns lists rather than at a stable
    // anchor.
    void navigate({
      to: '/students/$userId',
      params: { userId: item.studentId },
      ...(item.entityType === 'grading'
        ? { hash: `grading-${item.entityId}` }
        : {}),
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={aria}
        className="relative"
        onClick={() => setOpen(true)}
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('feedback.title')}</SheetTitle>
            <SheetDescription>
              {raw > 0
                ? t('feedback.unreadCount', {
                    count: raw,
                    defaultValue: '{{count}} unread',
                  })
                : t('feedback.noComments')}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4">
            {inboxQ.isPending ? (
              <p className="text-sm text-on-surface-variant">{t('feedback.loading')}</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-on-surface-variant">
                <Inbox className="size-8" aria-hidden />
                <p className="text-sm">{t('feedback.noComments')}</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.threadId}>
                    <button
                      type="button"
                      onClick={() => navigateTo(item)}
                      className="flex w-full flex-col gap-1 rounded-md border border-outline-variant/40 p-3 text-left transition-colors hover:bg-surface-container-low/60"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {item.studentName ?? item.studentId}
                        </span>
                        <span className="rounded-full bg-error px-1.5 text-[10px] font-semibold leading-4 text-on-error">
                          {item.unreadCount}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 text-xs text-on-surface-variant">
                        <span>
                          {t(`feedback.threadType.${item.entityType}`, {
                            defaultValue: item.entityType,
                          })}
                          {' · '}
                          {item.contextLabel}
                        </span>
                        <span>
                          {new Date(item.lastActivityAt).toLocaleString(i18n.language, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
