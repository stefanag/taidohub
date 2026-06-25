import { Award, BadgeCheck, Pencil, Shield, ShieldCheck, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@/entities/belt-rank';
import type { GradingHistoryRow } from '@/entities/rank-history';
import type { ShogoTitle } from '@/entities/shogo-title';

import { FeedbackThreadSheet } from '@/features/feedback-thread';
import { type BeltColor } from '@/shared/lib/belt-visuals';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { rankLabel, type Lang } from '@/shared/lib/rank-label';
import { Button } from '@/shared/ui';
import { BeltGraphic } from '@/shared/ui/belt-graphic';

/**
 * Shogo overlay paint on a black belt. `<BeltGraphic>` already supports
 * `overlayTopHalf`; we just pick the colour per title code.
 */
const SHOGO_OVERLAY: Record<string, BeltColor> = {
  renshi: 'magenta',
  kyoshi: 'green',
  hanshi: 'brown',
};

const SHOGO_NAME_FIELD: Record<Lang, keyof Pick<ShogoTitle, 'nameEn' | 'nameSv' | 'nameFi'>> = {
  en: 'nameEn',
  sv: 'nameSv',
  fi: 'nameFi',
};

export interface GradingTimelineEntryProps {
  entry: GradingHistoryRow;
  rank: BeltRank | undefined;
  systemCodeMap: Map<string, string>;
  shogoTitleMap: Map<string, ShogoTitle>;
  /** True when this row is the most recent passing grading; styled at full opacity. */
  isLatest: boolean;
  /** Subject of the grading row — passed to the per-row feedback Sheet. */
  subjectUserId?: string;
  onEdit?: (entry: GradingHistoryRow) => void;
  onVerify?: (id: string) => void;
  onUnverify?: (id: string) => void;
}

/**
 * One row of the grading timeline. Rendering rules are spec §9.6 — preserved
 * verbatim from the Taidopass `GradingTimelineEntry`. Icon mappings:
 *   `Award01` → `lucide-react`'s `Award`
 *   `CheckVerified01` → `BadgeCheck`
 *   `XClose` → `X`
 *   `Shield01` → `Shield`
 *   `ShieldTick` → `ShieldCheck`
 *   `Edit01` → `Pencil`
 *   The grading thread trigger (`<FeedbackThreadSheet>`) appears in the
 *   action row when both `subjectUserId` is set and the
 *   `instructor-feedback` flag is on.
 */
export function GradingTimelineEntry({
  entry,
  rank,
  systemCodeMap,
  shogoTitleMap,
  isLatest,
  subjectUserId,
  onEdit,
  onVerify,
  onUnverify,
}: GradingTimelineEntryProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const verificationEnabled = useFeatureFlag('grading-history-verification');
  const gradingHistoryEnabled = useFeatureFlag('grading-history');
  const lang = (i18n.language as Lang) ?? 'en';

  const isFail = entry.result === 'fail';
  const isExternal = entry.source === 'external';

  const localised = rank
    ? rankLabel(
        {
          nameRomaji: rank.nameRomaji,
          nameEn: rank.nameEn,
          nameSv: rank.nameSv,
          nameFi: rank.nameFi,
        },
        lang,
      )
    : '';
  // rankLabel returns "{romaji} — {localised}"; if `nameJa` exists, append it.
  const rankTitle = rank?.nameJa ? `${localised} ${rank.nameJa}`.trim() : localised;

  const systemCode = rank ? systemCodeMap.get(rank.systemId) ?? '' : '';
  const beltVisuals = rank?.visuals ?? null;

  let nodeClass: string;
  let NodeIcon: React.ComponentType<{ className?: string }>;
  if (isFail) {
    nodeClass = 'bg-error-container border border-error/15';
    NodeIcon = X;
  } else if (isLatest) {
    nodeClass = 'bg-primary-container shadow-xs';
    NodeIcon = BadgeCheck;
  } else {
    nodeClass = 'bg-surface-container-high';
    NodeIcon = Award;
  }

  const iconColor = isFail
    ? 'text-error'
    : isLatest
      ? 'text-white'
      : 'text-on-surface-variant';

  const borderColor = isFail
    ? 'rgba(186,26,26,0.2)'
    : rank
      ? isLatest
        ? rank.beltColor
        : `${rank.beltColor}66`
      : '#c5c6cd';

  const examinerLine = [entry.examiner, entry.organisationName].filter(Boolean).join(' · ');

  const shogoRow = entry.shogoTitle ? shogoTitleMap.get(entry.shogoTitle) : null;
  const shogoLabel = shogoRow ? shogoRow[SHOGO_NAME_FIELD[lang]] || shogoRow.nameEn : null;
  const shogoOverlay = entry.shogoTitle ? SHOGO_OVERLAY[entry.shogoTitle] : null;

  const showEdit = gradingHistoryEnabled && entry.canEdit && isExternal;
  const showVerifyOrUnverify = verificationEnabled && entry.canVerify;
  const showFeedback = subjectUserId !== undefined;
  const showActionRow = showEdit || showVerifyOrUnverify || showFeedback;

  return (
    <div className="relative flex items-start gap-10 pb-14 last:pb-0">
      <div
        className={`z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${nodeClass}`}
      >
        <NodeIcon className={`h-[22px] w-[22px] ${iconColor}`} />
      </div>

      <div className="flex-1 pt-1">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="font-headline text-xl font-bold text-primary">
            {rankTitle}
            {isFail ? (
              <span className="ml-3 inline-flex items-center gap-1 rounded-sm bg-error/8 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-error">
                {t('gradingHistory.timeline.failed', { defaultValue: 'Failed' })}
              </span>
            ) : null}
            {isExternal ? (
              <span className="ml-3 inline-flex items-center gap-1 rounded-sm bg-surface-container-high px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-on-surface-variant">
                {t('gradingHistory.timeline.external', { defaultValue: 'External' })}
              </span>
            ) : null}
            {verificationEnabled && entry.verified ? (
              <span
                className="ml-2 inline-flex items-center"
                title={
                  entry.verifiedBy
                    ? t('gradingHistory.timeline.verifiedBy', {
                        name: entry.verifiedBy.name,
                        date: entry.verifiedAt?.slice(0, 10) ?? '',
                        defaultValue: `verified by ${entry.verifiedBy.name} on ${entry.verifiedAt?.slice(0, 10) ?? ''}`,
                      })
                    : t('gradingHistory.timeline.verifiedFallback', { defaultValue: 'Verified' })
                }
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
            ) : null}
            {verificationEnabled && !entry.verified && isExternal ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-amber-100 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-amber-900">
                <Shield className="h-3 w-3" />
                {t('gradingHistory.timeline.pendingVerification', {
                  defaultValue: 'Pending verification',
                })}
              </span>
            ) : null}
            {shogoLabel ? (
              <span className="ml-3 inline-flex items-center gap-1 rounded-sm bg-primary-container px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                {shogoLabel}
              </span>
            ) : null}
          </h3>
          <span className="ml-4 shrink-0 text-sm font-semibold uppercase tracking-widest text-on-surface-variant">
            {entry.date}
          </span>
        </div>

        {showActionRow ? (
          <div className="mb-3 flex items-center gap-2">
            {showEdit ? (
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(entry)}>
                <Pencil className="mr-1 h-[14px] w-[14px]" />
                {t('gradingHistory.timeline.edit', { defaultValue: 'Edit' })}
              </Button>
            ) : null}
            {showVerifyOrUnverify ? (
              entry.verified ? (
                <Button variant="ghost" size="sm" onClick={() => onUnverify?.(entry.id)}>
                  {t('gradingHistory.timeline.unverify', { defaultValue: 'Unverify' })}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => onVerify?.(entry.id)}>
                  <ShieldCheck className="mr-1 h-[14px] w-[14px]" />
                  {t('gradingHistory.timeline.verify', { defaultValue: 'Verify' })}
                </Button>
              )
            ) : null}
            {showFeedback ? (
              <FeedbackThreadSheet
                entityType="grading"
                entityId={entry.id}
                studentId={subjectUserId!}
                contextLabel={`${rankTitle} · ${entry.date}`}
              />
            ) : null}
          </div>
        ) : null}

        {!isFail ? (
          shogoOverlay ? (
            <div className="mb-4">
              <BeltGraphic gradient="black" overlayTopHalf={shogoOverlay} className="w-48" />
            </div>
          ) : beltVisuals ? (
            <div className="mb-4">
              <BeltGraphic {...beltVisuals} className="w-48" />
            </div>
          ) : null
        ) : null}

        {examinerLine ? (
          <p className="mb-4 text-sm italic text-on-surface-variant">— {examinerLine}</p>
        ) : null}

        {entry.notes ? (
          <div
            className={`rounded-sm border-l-4 p-6 transition-colors ${
              isFail ? 'bg-error/3' : 'bg-surface-container-lowest hover:bg-white'
            }`}
            style={{ borderColor }}
          >
            <p className="text-sm leading-relaxed text-on-surface">{entry.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
