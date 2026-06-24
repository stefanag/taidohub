import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  FEEDBACK_REACTIONS,
  type FeedbackReaction,
} from '@repo/contracts/feedback';

import { Button } from '@/shared/ui';

/**
 * The five emoji reactions render as the glyph; the three text
 * reactions render as a localised label. The set + the order are
 * fixed by the spec, so the partition is hard-coded rather than
 * derived.
 */
const EMOJI_REACTIONS: ReadonlyArray<FeedbackReaction> = [
  'thumbs_up',
  'heart',
  'pray',
  'strong',
  'fire',
];
const TEXT_REACTIONS: ReadonlyArray<FeedbackReaction> = [
  'noted',
  'thank_you',
  'will_work_on_it',
];

// Sanity check at module load: the partition must cover the contract
// constant exactly. A diff means someone added a reaction and forgot
// to slot it into one of the two arrays.
if (
  process.env['NODE_ENV'] !== 'production' &&
  EMOJI_REACTIONS.length + TEXT_REACTIONS.length !== FEEDBACK_REACTIONS.length
) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ReactionPicker] partition mismatch — emoji + text counts ≠ FEEDBACK_REACTIONS length',
  );
}

export interface ReactionPickerProps {
  onSelect: (reaction: FeedbackReaction) => void;
}

/**
 * Inline popover content (the caller wraps in `Popover`/`PopoverContent`
 * so the trigger and positioning stay flexible). Five emoji glyphs on
 * one row, three localised text reactions on the next.
 */
export function ReactionPicker({ onSelect }: ReactionPickerProps): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="flex w-56 flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        {EMOJI_REACTIONS.map((r) => (
          <Button
            key={r}
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-lg"
            aria-label={t(`feedback.reactions.${r}`)}
            onClick={() => onSelect(r)}
          >
            {t(`feedback.reactions.${r}`)}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {TEXT_REACTIONS.map((r) => (
          <Button
            key={r}
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onSelect(r)}
          >
            {t(`feedback.reactions.${r}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
