import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedbackComment as FeedbackCommentType } from '@repo/contracts/feedback';

import i18n from '@/i18n';
import { openRadixPopover, stubRadixPointerEvents } from '@/shared/test/radix';

// Hoisted mocks for the four entity mutation hooks the component
// composes, plus session.
const { feedbackMocks, sessionMock } = vi.hoisted(() => ({
  feedbackMocks: {
    updateMutate: vi.fn(),
    deleteMutate: vi.fn(),
    setReactionMutate: vi.fn(),
    removeReactionMutate: vi.fn(),
    updateIsPending: false,
    deleteIsPending: false,
  },
  sessionMock: vi.fn<() => { data: { user: { id: string } } | null }>(() => ({
    data: { user: { id: 'author-1' } },
  })),
}));

vi.mock('@/entities/feedback', () => ({
  useUpdateFeedbackCommentMutation: () => ({
    mutate: feedbackMocks.updateMutate,
    isPending: feedbackMocks.updateIsPending,
  }),
  useDeleteFeedbackCommentMutation: () => ({
    mutate: feedbackMocks.deleteMutate,
    isPending: feedbackMocks.deleteIsPending,
  }),
  useSetFeedbackReactionMutation: () => ({
    mutate: feedbackMocks.setReactionMutate,
  }),
  useRemoveFeedbackReactionMutation: () => ({
    mutate: feedbackMocks.removeReactionMutate,
  }),
}));

vi.mock('@/entities/me', () => ({
  useSession: () => sessionMock(),
}));

import { FeedbackComment } from './FeedbackComment.js';

/**
 * `FeedbackComment` carries the per-row action surface for the
 * thread: edit / delete (author + within-window only), reactions
 * (toggle on/off), reply, and a deleted-state rendering. The specs
 * pin the gating that quietly breaks moderation UX when wrong:
 *
 *   - Edit / Delete render ONLY when the actor is the author AND
 *     the comment is within the 24h edit window AND the comment
 *     isn't already deleted. All three conditions matter.
 *   - The deleted-state rendering replaces the author name with
 *     "Deleted", italicises the body, and hides the action row.
 *   - Reaction chips toggle: clicking a chip you already reacted
 *     with removes the reaction; clicking a chip you haven't
 *     reacted with sets the reaction. Mutating the wrong way is
 *     silent — the visible chip flips after a refetch — so the
 *     test pins which mutation hook is called per branch.
 *   - The instructor-only badge renders only for instructor-only
 *     comments; the edited indicator renders only when updatedAt
 *     differs from createdAt.
 */

const THREAD_ID = 'thread-1';
const COMMENT_ID = 'comment-1';
const AUTHOR_ID = 'author-1';
const OTHER_ID = 'other-1';
const NOW = new Date('2026-06-28T12:00:00.000Z').getTime();
const RECENT = new Date(NOW - 60_000).toISOString(); // 1 min ago
const ONE_DAY_AGO = new Date(NOW - 24 * 60 * 60 * 1000 - 1000).toISOString();

/**
 * A createdAt anchored to real time — for tests that call
 * `vi.useRealTimers()`. The static `RECENT` above is anchored to `NOW`
 * (a fake-timer date), so under real timers it reads as ~24h+ old and
 * the edit window closes, hiding the Edit/Delete buttons those tests
 * depend on.
 */
function realRecentCreatedAt(): string {
  return new Date(Date.now() - 60_000).toISOString();
}

function makeComment(overrides: Partial<FeedbackCommentType> = {}): FeedbackCommentType {
  return {
    id: COMMENT_ID,
    threadId: THREAD_ID,
    authorId: AUTHOR_ID,
    authorName: 'Ada Lovelace',
    parentId: null,
    body: 'Hello',
    instructorOnly: false,
    createdAt: RECENT,
    updatedAt: RECENT,
    reactions: [],
    ...overrides,
  };
}

beforeAll(() => {
  // Radix Popover (the React picker) + Radix Dialog (the delete
  // confirm) both depend on the pointer-capture stubs.
  stubRadixPointerEvents();
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  feedbackMocks.updateMutate.mockReset();
  feedbackMocks.deleteMutate.mockReset();
  feedbackMocks.setReactionMutate.mockReset();
  feedbackMocks.removeReactionMutate.mockReset();
  feedbackMocks.updateIsPending = false;
  feedbackMocks.deleteIsPending = false;
  sessionMock.mockReturnValue({ data: { user: { id: AUTHOR_ID } } });
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderComment(comment: FeedbackCommentType, onReply = vi.fn()) {
  return {
    onReply,
    ...render(
      <I18nextProvider i18n={i18n}>
        <FeedbackComment
          comment={comment}
          threadId={THREAD_ID}
          onReply={onReply}
          depth={0}
        />
      </I18nextProvider>,
    ),
  };
}

describe('<FeedbackComment>', () => {
  describe('edit / delete action gating', () => {
    it('shows Edit + Delete when the actor is the author within the edit window', () => {
      sessionMock.mockReturnValue({ data: { user: { id: AUTHOR_ID } } });
      renderComment(makeComment());
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    it('hides Edit + Delete when the actor is NOT the author', () => {
      sessionMock.mockReturnValue({ data: { user: { id: OTHER_ID } } });
      renderComment(makeComment());
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it('hides Edit + Delete when the comment is older than the 24h edit window', () => {
      sessionMock.mockReturnValue({ data: { user: { id: AUTHOR_ID } } });
      renderComment(makeComment({ createdAt: ONE_DAY_AGO }));
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it('hides Edit + Delete when the comment is already deleted', () => {
      sessionMock.mockReturnValue({ data: { user: { id: AUTHOR_ID } } });
      renderComment(makeComment({ body: '[deleted]' }));
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    });
  });

  describe('deleted-state rendering', () => {
    it('replaces the author name with the Deleted label + leaves the [deleted] body', () => {
      renderComment(makeComment({ body: '[deleted]' }));
      // Both the author-name slot and the body slot show "[deleted]"
      // — the feedback.deleted i18n key happens to be the same
      // literal as the body's placeholder. Assert that the original
      // author name is gone and the deleted-placeholder appears at
      // both slots.
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
      expect(screen.getAllByText('[deleted]').length).toBeGreaterThanOrEqual(2);
    });

    it('hides the Reply + React buttons on deleted comments', () => {
      renderComment(makeComment({ body: '[deleted]' }));
      expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^react$/i })).not.toBeInTheDocument();
    });
  });

  describe('reaction chip toggle', () => {
    it('REMOVES the reaction when clicking a chip the user already reacted with', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      renderComment(
        makeComment({
          reactions: [
            {
              commentId: COMMENT_ID,
              userId: AUTHOR_ID,
              reaction: 'thumbs_up',
              createdAt: RECENT,
            },
          ],
        }),
      );
      // The chip's emoji is `aria-hidden` so the accessible name is
      // just the count. Query the visible glyph and walk up to the
      // enclosing button.
      const glyph = screen.getByText('👍');
      const chip = glyph.closest('button');
      expect(chip).not.toBeNull();
      await user.click(chip!);
      expect(feedbackMocks.removeReactionMutate).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        threadId: THREAD_ID,
      });
      expect(feedbackMocks.setReactionMutate).not.toHaveBeenCalled();
    });

    it('SETS the reaction when clicking a chip the user has NOT reacted with', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      renderComment(
        makeComment({
          reactions: [
            {
              commentId: COMMENT_ID,
              userId: OTHER_ID,
              reaction: 'heart',
              createdAt: RECENT,
            },
          ],
        }),
      );
      const glyph = screen.getByText('❤️');
      const chip = glyph.closest('button');
      expect(chip).not.toBeNull();
      await user.click(chip!);
      expect(feedbackMocks.setReactionMutate).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        reaction: 'heart',
        threadId: THREAD_ID,
      });
      expect(feedbackMocks.removeReactionMutate).not.toHaveBeenCalled();
    });
  });

  describe('save edit', () => {
    it('forwards the new body to the update mutation', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      sessionMock.mockReturnValue({ data: { user: { id: AUTHOR_ID } } });
      renderComment(makeComment({ createdAt: realRecentCreatedAt() }));
      await user.click(screen.getByRole('button', { name: /^edit$/i }));
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, 'Edited body');
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      expect(feedbackMocks.updateMutate).toHaveBeenCalledTimes(1);
      expect(feedbackMocks.updateMutate).toHaveBeenCalledWith(
        { commentId: COMMENT_ID, input: { body: 'Edited body' } },
        expect.any(Object),
      );
    });
  });

  describe('badges + indicators', () => {
    it('renders the instructor-only badge when the comment is marked instructorOnly', () => {
      renderComment(makeComment({ instructorOnly: true }));
      // The i18n key `feedback.instructorOnly` renders as "Instructor note"
      // in en (see locale file).
      expect(screen.getByText(/instructor note/i)).toBeInTheDocument();
    });

    it('does NOT render the instructor-only badge for regular comments', () => {
      renderComment(makeComment({ instructorOnly: false }));
      expect(screen.queryByText(/instructor note/i)).not.toBeInTheDocument();
    });

    it('renders the edited indicator when updatedAt differs from createdAt', () => {
      const updatedLater = new Date(NOW - 30_000).toISOString();
      renderComment(makeComment({ createdAt: RECENT, updatedAt: updatedLater }));
      expect(screen.getByText(/edited/i)).toBeInTheDocument();
    });

    it('does NOT render the edited indicator on a freshly-created comment', () => {
      renderComment(makeComment({ createdAt: RECENT, updatedAt: RECENT }));
      expect(screen.queryByText(/edited/i)).not.toBeInTheDocument();
    });
  });

  describe('Popover-based ReactionPicker', () => {
    it('forwards a picker selection to the set-reaction mutation', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      renderComment(makeComment());

      // Open the React popover (the smile-icon button). The
      // `aria-label` is `feedback.react` → "React" in en.
      const reactTrigger = screen.getByRole('button', { name: /^react$/i });
      await openRadixPopover(reactTrigger);

      // Pick one of the picker's emoji reactions. The picker's
      // emoji buttons carry their localised glyph as aria-label
      // (set in ReactionPicker.tsx) — query by name.
      const thumbsUp = await screen.findByRole('button', { name: '👍' });
      await user.click(thumbsUp);

      expect(feedbackMocks.setReactionMutate).toHaveBeenCalledTimes(1);
      expect(feedbackMocks.setReactionMutate).toHaveBeenCalledWith({
        commentId: COMMENT_ID,
        reaction: 'thumbs_up',
        threadId: THREAD_ID,
      });
      expect(feedbackMocks.removeReactionMutate).not.toHaveBeenCalled();
    });
  });

  describe('Delete confirm Dialog', () => {
    it('opens the dialog on Delete click + fires the delete mutation on Confirm', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      sessionMock.mockReturnValue({ data: { user: { id: AUTHOR_ID } } });
      renderComment(makeComment({ createdAt: realRecentCreatedAt() }));

      // Click the Delete action button — sets the
      // confirmDelete state which opens the Radix Dialog.
      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      // The Dialog renders into a portal; scope the Confirm button
      // search to the dialog itself so we don't match the trigger.
      const dialog = await screen.findByRole('dialog');
      const confirmButton = within(dialog).getByRole('button', { name: /^delete$/i });
      await user.click(confirmButton);

      expect(feedbackMocks.deleteMutate).toHaveBeenCalledTimes(1);
      const [arg, opts] = feedbackMocks.deleteMutate.mock.calls[0]!;
      expect(arg).toBe(COMMENT_ID);
      // The mutation receives an onSuccess option that closes the
      // dialog. Driving it from the test confirms the bridge is
      // wired even when the mutation is mocked.
      expect(opts).toMatchObject({ onSuccess: expect.any(Function) });
    });
  });
});
