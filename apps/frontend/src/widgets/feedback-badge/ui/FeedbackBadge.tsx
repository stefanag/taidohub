import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Bell, ExternalLink, Inbox } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useFeedbackInboxQuery,
  useFeedbackUnreadCountQuery,
  type FeedbackInboxItem,
} from '@/entities/feedback';
import { useSession } from '@/features/auth-by-email';
import { FeedbackThread } from '@/features/feedback-thread';
import { FeatureFlag } from '@/shared/lib/feature-flags';
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
 * that has two views:
 *
 *   - list view: the inbox of threads with unread activity, lazily
 *     fetched only while the sheet is open.
 *   - thread view: the selected thread rendered inline so reading the
 *     feedback never requires a route change. Particularly important
 *     when the feedback's `studentId` is the actor themselves (e.g.,
 *     one instructor leaving feedback on another instructor's
 *     technique) — sending them to `/students/<myself>` made no sense.
 *
 * A "View on student page" link in the thread view preserves the
 * deep-link path for the common instructor-viewing-a-student case.
 */
/**
 * Outer flag gate. When `instructor-feedback` is off, nothing under
 * the wrapper mounts — no badge, no unread poll, no inbox SELECT.
 * The inner component holds all the hook calls, so the lazy
 * "queries don't run when the feature is disabled" contract is
 * enforced structurally rather than by an early `return null`.
 */
export function FeedbackBadge(): React.ReactElement {
  return (
    <FeatureFlag code="instructor-feedback">
      <FeedbackBadgeContent />
    </FeatureFlag>
  );
}

function FeedbackBadgeContent(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const actorId = session.data?.user?.id ?? null;

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<FeedbackInboxItem | null>(null);

  const { data } = useFeedbackUnreadCountQuery();
  const inboxQ = useFeedbackInboxQuery(open);

  // Reset the inline thread view whenever the sheet closes — otherwise
  // reopening would surprise the user by skipping the list. Handled
  // inline in setOpenChange below, not via a setState-in-effect.
  const handleOpenChange = React.useCallback((next: boolean): void => {
    setOpen(next);
    if (!next) setSelected(null);
  }, []);

  const raw = data?.count ?? 0;
  const display = raw > 99 ? '99+' : String(raw);
  const aria =
    raw === 0
      ? t('feedback.title')
      : t('feedback.unreadCount', { count: raw, defaultValue: '{{count}} unread' });

  const items = inboxQ.data ?? [];

  const viewOnStudentPage = (item: FeedbackInboxItem): void => {
    setOpen(false);
    void navigate({
      to: '/students/$userId',
      params: { userId: item.studentId },
      ...(item.entityType === 'grading'
        ? { hash: `grading-${item.entityId}` }
        : {}),
    });
  };

  const isSelfThread = selected !== null && selected.studentId === actorId;

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

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected === null ? (
            <>
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
                  <p className="text-sm text-on-surface-variant">
                    {t('feedback.loading')}
                  </p>
                ) : inboxQ.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {inboxQ.error instanceof Error
                      ? inboxQ.error.message
                      : t('common.unknownError')}
                  </p>
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
                          onClick={() => setSelected(item)}
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
                              {new Date(item.lastActivityAt).toLocaleString(
                                i18n.language,
                                {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                },
                              )}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('feedback.cancel')}
                    onClick={() => setSelected(null)}
                    className="-ml-2"
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                  </Button>
                  <SheetTitle className="text-base">
                    {t(`feedback.threadType.${selected.entityType}`, {
                      defaultValue: selected.entityType,
                    })}
                    {' · '}
                    {selected.contextLabel}
                  </SheetTitle>
                </div>
                <SheetDescription>
                  {selected.studentName ?? selected.studentId}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4">
                <FeedbackThread
                  entityType={selected.entityType}
                  entityId={selected.entityId}
                  studentId={selected.studentId}
                />
              </div>

              {!isSelfThread ? (
                <div className="mt-4 border-t border-outline-variant/40 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => viewOnStudentPage(selected)}
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    {t('feedback.viewStudent', { defaultValue: 'View student' })}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
