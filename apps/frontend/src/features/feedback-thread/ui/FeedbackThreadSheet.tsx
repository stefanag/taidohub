import { MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedbackEntityType } from '@repo/contracts/feedback';

import { FeatureFlag } from '@/shared/lib/feature-flags';
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
 * Outer `<FeatureFlag>` gate keeps the trigger button and the
 * Sheet's hook surface (`useState(open)`) from rendering at all
 * when `instructor-feedback` is off — a row in the 50-technique
 * list never even tries to mount the per-row React state slot
 * when the feature is disabled.
 */
export function FeedbackThreadSheet(props: FeedbackThreadSheetProps): React.ReactElement {
  return (
    <FeatureFlag code="instructor-feedback">
      <FeedbackThreadSheetContent {...props} />
    </FeatureFlag>
  );
}

function FeedbackThreadSheetContent({
  entityType,
  entityId,
  studentId,
  contextLabel,
  trigger,
}: FeedbackThreadSheetProps): React.ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

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
