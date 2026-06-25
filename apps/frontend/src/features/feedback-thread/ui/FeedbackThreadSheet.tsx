import { MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedbackEntityType } from '@repo/contracts/feedback';

import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { Button } from '@/shared/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet.js';

import { FeedbackThread } from './FeedbackThread.js';

export interface FeedbackThreadSheetProps {
  entityType: FeedbackEntityType;
  entityId: string;
  studentId: string;
  /** Label rendered in the Sheet header — e.g. the technique name or "Stefan Agnvall · 2nd dan". */
  contextLabel: string;
  /** Override the default button content. Defaults to a chat icon + label. */
  trigger?: React.ReactNode;
}

/**
 * Inline-trigger Sheet pattern for per-row feedback. The thread itself is
 * only mounted while the sheet is open — that keeps `useFeedbackThreadQuery`
 * / `useFeedbackCommentsQuery` lazy, so a list of 50 techniques doesn't fire
 * 50 thread fetches on render.
 *
 * Gated by the `instructor-feedback` feature flag: when off the component
 * returns `null` so the trigger button disappears entirely and the backend
 * never sees a flag-disabled request.
 */
export function FeedbackThreadSheet({
  entityType,
  entityId,
  studentId,
  contextLabel,
  trigger,
}: FeedbackThreadSheetProps): React.ReactElement | null {
  const { t } = useTranslation();
  const flagOn = useFeatureFlag('instructor-feedback');
  const [open, setOpen] = React.useState(false);

  if (!flagOn) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label={t('feedback.title')}
          >
            <MessageCircle className="size-4" aria-hidden />
            <span>{t('feedback.title')}</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('feedback.title')}</SheetTitle>
          <SheetDescription>{contextLabel}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {open ? (
            <FeedbackThread
              entityType={entityType}
              entityId={entityId}
              studentId={studentId}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
