import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { FeatureFlagsProvider } from '@/shared/lib/feature-flags';

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

vi.mock('@/features/auth-by-email', () => ({
  useSession: () => ({ data: { user: { id: 'actor-1' } } }),
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

beforeEach(async () => {
  await i18n.changeLanguage('en');
  hooks.unreadCount.mockReturnValue({ data: { count: 0 } });
  hooks.inbox.mockReturnValue({ data: [], isPending: false, isError: false });
  navigateMock.mockReset();
});

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
});
