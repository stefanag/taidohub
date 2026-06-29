import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { FeatureFlagsProvider } from '@/shared/lib/feature-flags';
import { stubRadixPointerEvents } from '@/shared/test/radix';

const { hooks } = vi.hoisted(() => ({
  hooks: {
    unreadCount: vi.fn<() => { data: { count: number } | undefined }>(() => ({
      data: { count: 0 },
    })),
    inbox: vi.fn<(enabled: boolean) => { data: unknown[]; isPending: boolean; isError: boolean }>(
      () => ({ data: [], isPending: false, isError: false }),
    ),
  },
}));

vi.mock('@/entities/feedback', () => ({
  useFeedbackUnreadCountQuery: () => hooks.unreadCount(),
  useFeedbackInboxQuery: (enabled: boolean) => hooks.inbox(enabled),
}));

const sessionMock = vi.hoisted(() => ({
  fn: vi.fn<() => { data: { user: { id: string } } | null }>(() => ({
    data: { user: { id: 'actor-1' } },
  })),
}));
vi.mock('@/features/auth-by-email', () => ({
  useSession: () => sessionMock.fn(),
}));

// Stub `<FeedbackThread>` so the test doesn't need its full
// entity-graph dependency stack.
vi.mock('@/features/feedback-thread', () => ({
  FeedbackThread: (props: { studentId: string }) => (
    <div data-testid="thread-mounted" data-student={props.studentId} />
  ),
}));

// Stub TanStack Router useNavigate so `viewOnStudentPage` is
// observable but doesn't need a RouterProvider.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { FeedbackBadge } from './FeedbackBadge.js';

/**
 * `FeedbackBadge` is the bell-icon entry point to the feedback
 * feature. The behaviours worth pinning:
 *
 *   - The outer `<FeatureFlag>` gate ensures NOTHING under it
 *     mounts when the flag is off — no bell, no unread poll, no
 *     inbox SELECT. The test verifies the bell button is absent.
 *   - The unread-count pill displays the raw number up to 99 and
 *     caps to "99+" beyond. A future "let me just show the raw
 *     count" change would silently let a 4-digit count blow out
 *     the layout.
 *   - Opening the Sheet enables the lazy inbox query (the inbox
 *     hook is called with the open boolean; the test asserts the
 *     last call's argument).
 */

beforeAll(() => {
  // The Sheet open/close is controlled via state in this component
  // (not by Radix's pointer-event machinery), so the bell + inner
  // buttons all work with plain userEvent.click. Stubbing the
  // pointer-capture methods anyway makes the spec resilient to a
  // future Radix version that adds pointer-event hooks to Sheet.
  stubRadixPointerEvents();
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  hooks.unreadCount.mockReturnValue({ data: { count: 0 } });
  hooks.inbox.mockReturnValue({ data: [], isPending: false, isError: false });
  navigateMock.mockReset();
  sessionMock.fn.mockReturnValue({ data: { user: { id: 'actor-1' } } });
});

const ITEM_GRADING = {
  threadId: 't-grading',
  entityType: 'grading' as const,
  entityId: 'gr-1',
  studentId: 'student-1',
  studentName: 'Ada Lovelace',
  contextLabel: '2nd Dan · 2026-06-01',
  unreadCount: 3,
  lastActivityAt: '2026-06-25T10:00:00.000Z',
};

const ITEM_TECHNIQUE = {
  threadId: 't-technique',
  entityType: 'technique' as const,
  entityId: 'tech-1',
  studentId: 'student-2',
  studentName: 'Bob',
  contextLabel: 'Tsuki',
  unreadCount: 1,
  lastActivityAt: '2026-06-24T10:00:00.000Z',
};

function renderBadge(instructorFeedback = true) {
  return render(
    <I18nextProvider i18n={i18n}>
      <FeatureFlagsProvider
        flags={{
          'instructor-feedback': instructorFeedback,
          'grading-history': true,
          'grading-history-verification': true,
        }}
      >
        <FeedbackBadge />
      </FeatureFlagsProvider>
    </I18nextProvider>,
  );
}

describe('<FeedbackBadge>', () => {
  it('renders nothing when the instructor-feedback flag is off', () => {
    renderBadge(false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // Neither hook should be invoked because the inner component
    // never mounts.
    expect(hooks.unreadCount).not.toHaveBeenCalled();
    expect(hooks.inbox).not.toHaveBeenCalled();
  });

  it('renders the bell button when the flag is on, with zero-count title', () => {
    hooks.unreadCount.mockReturnValue({ data: { count: 0 } });
    renderBadge(true);
    // With count 0 the accessible name falls back to `feedback.title`
    // ("Feedback" in en).
    expect(screen.getByRole('button', { name: /^feedback$/i })).toBeInTheDocument();
  });

  it('displays the unread count when greater than zero', () => {
    hooks.unreadCount.mockReturnValue({ data: { count: 7 } });
    renderBadge(true);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('caps the displayed count at "99+" past 99', () => {
    hooks.unreadCount.mockReturnValue({ data: { count: 245 } });
    renderBadge(true);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('keeps the inbox query disabled until the sheet opens', async () => {
    hooks.unreadCount.mockReturnValue({ data: { count: 0 } });
    renderBadge(true);

    // Initial render: inbox called with `false` (sheet closed).
    expect(hooks.inbox).toHaveBeenCalled();
    expect(hooks.inbox.mock.calls.at(-1)![0]).toBe(false);

    // Click the bell — the state flips to open, the inbox hook
    // re-invokes with `true`.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /feedback/i }));
    expect(hooks.inbox.mock.calls.at(-1)![0]).toBe(true);
  });

  describe('inbox → thread state machine', () => {
    it('switches from the inbox list to the thread view when an item is clicked', async () => {
      hooks.unreadCount.mockReturnValue({ data: { count: 3 } });
      hooks.inbox.mockReturnValue({
        data: [ITEM_GRADING],
        isPending: false,
        isError: false,
      });
      renderBadge(true);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /feedback|unread/i }));
      // Inbox list view: the item button shows the student name + the
      // entity-type label ("Grading feedback").
      const itemButton = await screen.findByRole('button', { name: /Ada Lovelace/i });
      expect(itemButton).toBeInTheDocument();

      await user.click(itemButton);

      // Thread view: the stubbed FeedbackThread mounts with the
      // selected item's entity / student props.
      const thread = await screen.findByTestId('thread-mounted');
      expect(thread).toHaveAttribute('data-student', 'student-1');
    });

    it('returns to the inbox list when the back button is clicked', async () => {
      hooks.unreadCount.mockReturnValue({ data: { count: 1 } });
      hooks.inbox.mockReturnValue({
        data: [ITEM_GRADING],
        isPending: false,
        isError: false,
      });
      renderBadge(true);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /feedback|unread/i }));
      await user.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));
      expect(await screen.findByTestId('thread-mounted')).toBeInTheDocument();

      // The back button's accessible name is `feedback.cancel` ("Cancel").
      const sheet = screen.getByRole('dialog');
      const backButton = within(sheet).getByRole('button', { name: /cancel/i });
      await user.click(backButton);

      // Thread unmounts; inbox item button reappears.
      expect(screen.queryByTestId('thread-mounted')).not.toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /Ada Lovelace/i })).toBeInTheDocument();
    });

    it('navigates with the grading hash when "View student" is clicked on a grading thread', async () => {
      hooks.unreadCount.mockReturnValue({ data: { count: 1 } });
      hooks.inbox.mockReturnValue({
        data: [ITEM_GRADING],
        isPending: false,
        isError: false,
      });
      renderBadge(true);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /feedback|unread/i }));
      await user.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));

      await user.click(await screen.findByRole('button', { name: /view student/i }));

      expect(navigateMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/students/$userId',
        params: { userId: 'student-1' },
        hash: 'grading-gr-1',
      });
    });

    it('navigates WITHOUT the hash on a non-grading entity type', async () => {
      hooks.unreadCount.mockReturnValue({ data: { count: 1 } });
      hooks.inbox.mockReturnValue({
        data: [ITEM_TECHNIQUE],
        isPending: false,
        isError: false,
      });
      renderBadge(true);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /feedback|unread/i }));
      await user.click(await screen.findByRole('button', { name: /Bob/i }));
      await user.click(await screen.findByRole('button', { name: /view student/i }));

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const [arg] = navigateMock.mock.calls[0]!;
      expect(arg).toMatchObject({
        to: '/students/$userId',
        params: { userId: 'student-2' },
      });
      // The grading-specific hash should NOT be present for technique
      // entities — `viewOnStudentPage` only adds it when entityType === 'grading'.
      expect((arg as { hash?: string }).hash).toBeUndefined();
    });

    it('hides the "View student" link when the selected thread is a self-thread', async () => {
      // Actor is the same user the thread is about → studentId === actorId.
      sessionMock.fn.mockReturnValue({ data: { user: { id: 'student-1' } } });
      hooks.unreadCount.mockReturnValue({ data: { count: 1 } });
      hooks.inbox.mockReturnValue({
        data: [ITEM_GRADING],
        isPending: false,
        isError: false,
      });
      renderBadge(true);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /feedback|unread/i }));
      await user.click(await screen.findByRole('button', { name: /Ada Lovelace/i }));

      expect(await screen.findByTestId('thread-mounted')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /view student/i })).not.toBeInTheDocument();
    });
  });
});
