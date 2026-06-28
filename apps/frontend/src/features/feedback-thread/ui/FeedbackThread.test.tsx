import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { FeatureFlagsProvider } from '@/shared/lib/feature-flags';

// Hoisted entity-hook mocks so the `vi.mock` factories below can close
// over them. The component composes 5 entity-graph hooks; each test
// overrides the return values as needed via these mock objects.
const { feedbackMocks, sessionMock } = vi.hoisted(() => ({
  feedbackMocks: {
    useFeedbackThreadQuery: vi.fn<() => { data: unknown; isPending: boolean }>(() => ({
      data: null,
      isPending: false,
    })),
    useFeedbackCommentsQuery: vi.fn<() => { data: unknown[]; isPending: boolean }>(() => ({
      data: [],
      isPending: false,
    })),
    markReadMutate: vi.fn<(id: string) => void>(),
    createThreadAsync: vi.fn<(input: unknown) => Promise<{ id: string }>>(),
    createCommentAsync: vi.fn<(input: unknown) => Promise<unknown>>(),
    createThreadIsPending: false,
    createCommentIsPending: false,
  },
  sessionMock: vi.fn<() => { data: { user: { id: string } } | null }>(() => ({
    data: { user: { id: 'instructor-1' } },
  })),
}));

vi.mock('@/entities/feedback', () => ({
  useFeedbackThreadQuery: (...args: unknown[]) =>
    (feedbackMocks.useFeedbackThreadQuery as (...a: unknown[]) => unknown)(...args),
  useFeedbackCommentsQuery: (...args: unknown[]) =>
    (feedbackMocks.useFeedbackCommentsQuery as (...a: unknown[]) => unknown)(...args),
  useMarkFeedbackThreadReadMutation: () => ({ mutate: feedbackMocks.markReadMutate }),
  useCreateFeedbackThreadMutation: () => ({
    mutateAsync: feedbackMocks.createThreadAsync,
    isPending: feedbackMocks.createThreadIsPending,
  }),
  useCreateFeedbackCommentMutation: () => ({
    mutateAsync: feedbackMocks.createCommentAsync,
    isPending: feedbackMocks.createCommentIsPending,
  }),
}));

vi.mock('@/entities/me', () => ({
  useSession: () => sessionMock(),
}));

// Mock FeedbackComment so the test doesn't have to wire its own setup.
// The mock renders enough to identify which comments rendered + at
// which depth (top-level vs nested).
vi.mock('./FeedbackComment.js', () => ({
  FeedbackComment: ({
    comment,
    depth,
    children,
  }: {
    comment: { id: string; body: string };
    depth: number;
    children?: React.ReactNode;
  }) => (
    <div data-testid={`comment-${comment.id}`} data-depth={depth}>
      <span>{comment.body}</span>
      {children}
    </div>
  ),
}));

import { FeedbackThread } from './FeedbackThread.js';

/**
 * `FeedbackThread` is the heart of the feedback feature: it composes 5
 * entity-graph hooks, owns composer state, lazily creates the thread
 * on first post, and fires the auto-mark-read effect. The specs here
 * pin the behaviours that quietly break the UI when wrong:
 *
 *   - Empty / loading / populated render branches.
 *   - The mark-read effect is fired ONCE per thread.id (the user
 *     leaving and re-opening the same thread shouldn't re-fire it
 *     mid-poll).
 *   - The instructor-only toggle is hidden for the thread's subject
 *     (the student themselves can't toggle visibility on their own
 *     feedback).
 *   - The composer's post path creates the thread lazily when there
 *     isn't one yet, and forwards the right per-call inputs.
 *
 * Heavy mock setup is the cost of testing a feature this composed —
 * mocking the entity-graph layer is the recipe's Pattern 2 + 4 hybrid
 * (`docs/frontend-test-recipe.md`).
 */

const THREAD_ID = 'thread-1';
const STUDENT_ID = 'student-1';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  // Reset every hoisted mock to its default per-test state.
  feedbackMocks.useFeedbackThreadQuery.mockReturnValue({ data: null, isPending: false });
  feedbackMocks.useFeedbackCommentsQuery.mockReturnValue({ data: [], isPending: false });
  feedbackMocks.markReadMutate.mockReset();
  feedbackMocks.createThreadAsync.mockReset();
  feedbackMocks.createCommentAsync.mockReset();
  feedbackMocks.createThreadIsPending = false;
  feedbackMocks.createCommentIsPending = false;
  sessionMock.mockReturnValue({ data: { user: { id: 'instructor-1' } } });
});

function renderThread(studentId = STUDENT_ID) {
  return render(
    <I18nextProvider i18n={i18n}>
      <FeatureFlagsProvider
        flags={{
          'instructor-feedback': true,
          'grading-history': true,
          'grading-history-verification': true,
        }}
      >
        <FeedbackThread entityType="technique" entityId="tech-1" studentId={studentId} />
      </FeatureFlagsProvider>
    </I18nextProvider>,
  );
}

describe('<FeedbackThread>', () => {
  it('renders the loading placeholder while the thread query is pending', () => {
    feedbackMocks.useFeedbackThreadQuery.mockReturnValue({ data: null, isPending: true });
    renderThread();
    expect(screen.getByText(/loading feedback/i)).toBeInTheDocument();
  });

  it('renders the empty state when the thread exists but has no comments', () => {
    feedbackMocks.useFeedbackThreadQuery.mockReturnValue({
      data: { id: THREAD_ID },
      isPending: false,
    });
    feedbackMocks.useFeedbackCommentsQuery.mockReturnValue({ data: [], isPending: false });
    renderThread();
    expect(screen.getByText(/no feedback yet/i)).toBeInTheDocument();
  });

  it('marks the thread read once after comments resolve', async () => {
    feedbackMocks.useFeedbackThreadQuery.mockReturnValue({
      data: { id: THREAD_ID },
      isPending: false,
    });
    feedbackMocks.useFeedbackCommentsQuery.mockReturnValue({
      data: [
        { id: 'c-1', parentId: null, body: 'Top', threadId: THREAD_ID, authorId: 'a', createdAt: '' },
      ],
      isPending: false,
    });
    const { rerender } = renderThread();

    await waitFor(() => {
      expect(feedbackMocks.markReadMutate).toHaveBeenCalledWith(THREAD_ID);
    });
    expect(feedbackMocks.markReadMutate).toHaveBeenCalledTimes(1);

    // Re-render with the same thread id — the ref guard inside the
    // effect should prevent a second `mutate` call.
    rerender(
      <I18nextProvider i18n={i18n}>
        <FeatureFlagsProvider
          flags={{
            'instructor-feedback': true,
            'grading-history': true,
            'grading-history-verification': true,
          }}
        >
          <FeedbackThread entityType="technique" entityId="tech-1" studentId={STUDENT_ID} />
        </FeatureFlagsProvider>
      </I18nextProvider>,
    );
    expect(feedbackMocks.markReadMutate).toHaveBeenCalledTimes(1);
  });

  it('does NOT mark the thread read while the comments query is pending', () => {
    feedbackMocks.useFeedbackThreadQuery.mockReturnValue({
      data: { id: THREAD_ID },
      isPending: false,
    });
    feedbackMocks.useFeedbackCommentsQuery.mockReturnValue({
      data: [],
      isPending: true,
    });
    renderThread();
    expect(feedbackMocks.markReadMutate).not.toHaveBeenCalled();
  });

  it('hides the instructor-only toggle when the actor IS the thread subject', () => {
    sessionMock.mockReturnValue({ data: { user: { id: STUDENT_ID } } });
    renderThread();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the instructor-only toggle when the actor is NOT the thread subject', () => {
    sessionMock.mockReturnValue({ data: { user: { id: 'instructor-1' } } });
    renderThread();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('disables the Post button while the composer body is empty', () => {
    renderThread();
    expect(screen.getByRole('button', { name: /post/i })).toBeDisabled();
  });

  it('creates the thread lazily on first post + then creates the comment', async () => {
    feedbackMocks.useFeedbackThreadQuery.mockReturnValue({ data: null, isPending: false });
    feedbackMocks.createThreadAsync.mockResolvedValue({ id: THREAD_ID });
    feedbackMocks.createCommentAsync.mockResolvedValue(undefined);
    renderThread();
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'Hi');
    await user.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() => {
      expect(feedbackMocks.createThreadAsync).toHaveBeenCalledTimes(1);
    });
    expect(feedbackMocks.createThreadAsync).toHaveBeenCalledWith({
      entityType: 'technique',
      entityId: 'tech-1',
      studentId: STUDENT_ID,
    });
    expect(feedbackMocks.createCommentAsync).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      input: { body: 'Hi', parentId: null, instructorOnly: false },
    });
  });

  it('skips the lazy thread create when a thread already exists', async () => {
    feedbackMocks.useFeedbackThreadQuery.mockReturnValue({
      data: { id: THREAD_ID },
      isPending: false,
    });
    feedbackMocks.createCommentAsync.mockResolvedValue(undefined);
    renderThread();
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'Hi');
    await user.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() => {
      expect(feedbackMocks.createCommentAsync).toHaveBeenCalled();
    });
    expect(feedbackMocks.createThreadAsync).not.toHaveBeenCalled();
    expect(feedbackMocks.createCommentAsync).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      input: { body: 'Hi', parentId: null, instructorOnly: false },
    });
  });
});
