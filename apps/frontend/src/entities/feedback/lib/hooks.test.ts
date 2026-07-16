import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import * as api from '../api/feedback.api.js';

import {
  feedbackKeys,
  useCreateFeedbackCommentMutation,
  useCreateFeedbackThreadMutation,
  useDeleteFeedbackCommentMutation,
  useMarkFeedbackThreadReadMutation,
  useRemoveFeedbackReactionMutation,
  useSetFeedbackReactionMutation,
  useUpdateFeedbackCommentMutation,
} from './hooks.js';

/**
 * The feedback entity's mutation graph is the foundation Phase 5.4b
 * pins. Bugs here silently leak comments / read-status across views
 * (e.g., a deleted comment lingering in the bell-icon Sheet, or the
 * badge count going stale after a "mark read"). Each test asserts the
 * exact `queryClient.invalidateQueries` call(s) the hook should make on
 * success — that's the contract every consumer of these hooks (the
 * `feedback-thread` feature, the bell-icon Sheet, the badge widget)
 * relies on.
 *
 * Pattern 1 from `docs/frontend-test-recipe.md`: `renderHook` +
 * `QueryClientProvider` wrapper + `vi.spyOn` on the intra-slice
 * fetcher + assertions on `invalidateQueries`.
 */

function wrap(client: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'QueryWrapper';
  return Wrapper;
}

const THREAD_ID = 'thread-1';
const COMMENT_ID = 'comment-1';

describe('feedbackKeys', () => {
  it('pins the coarse root', () => {
    expect(feedbackKeys.all).toEqual(['feedback']);
  });

  it('nests the per-thread key under the root', () => {
    expect(feedbackKeys.thread('technique', 'tech-1', 'student-1')).toEqual([
      'feedback',
      'thread',
      'technique',
      'tech-1',
      'student-1',
    ]);
  });

  it('nests the student-threads key under the root', () => {
    expect(feedbackKeys.studentThreads('student-1')).toEqual([
      'feedback',
      'student-threads',
      'student-1',
    ]);
  });

  it('nests the per-thread comments key under the root', () => {
    expect(feedbackKeys.comments(THREAD_ID)).toEqual([
      'feedback',
      'comments',
      THREAD_ID,
    ]);
  });

  it('exposes stable static keys for unread + inbox', () => {
    expect(feedbackKeys.unread).toEqual(['feedback', 'unread']);
    expect(feedbackKeys.inbox).toEqual(['feedback', 'inbox']);
  });
});

describe('useCreateFeedbackThreadMutation', () => {
  it('invalidates the entire feedback root on success', async () => {
    vi.spyOn(api, 'createThread').mockResolvedValue({
      id: THREAD_ID,
    } as Awaited<ReturnType<typeof api.createThread>>);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateFeedbackThreadMutation(), {
      wrapper: wrap(client),
    });

    await act(() =>
      result.current.mutateAsync({
        entityType: 'technique',
        entityId: 'tech-1',
        studentId: 'student-1',
      }),
    );

    expect(spy).toHaveBeenCalledWith({ queryKey: feedbackKeys.all });
  });
});

describe('useCreateFeedbackCommentMutation', () => {
  it('invalidates the per-thread comments AND the unread count on success', async () => {
    vi.spyOn(api, 'createComment').mockResolvedValue({
      id: COMMENT_ID,
    } as Awaited<ReturnType<typeof api.createComment>>);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateFeedbackCommentMutation(), {
      wrapper: wrap(client),
    });

    await act(() =>
      result.current.mutateAsync({
        threadId: THREAD_ID,
        input: { body: 'hi', parentId: null, instructorOnly: false },
      }),
    );

    expect(spy).toHaveBeenCalledWith({
      queryKey: feedbackKeys.comments(THREAD_ID),
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: feedbackKeys.unread });
  });
});

describe('useUpdateFeedbackCommentMutation', () => {
  it('invalidates the entire feedback root on success', async () => {
    vi.spyOn(api, 'updateComment').mockResolvedValue({
      id: COMMENT_ID,
    } as Awaited<ReturnType<typeof api.updateComment>>);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateFeedbackCommentMutation(), {
      wrapper: wrap(client),
    });

    await act(() =>
      result.current.mutateAsync({
        commentId: COMMENT_ID,
        input: { body: 'edited' },
      }),
    );

    // Comment id alone doesn't carry the threadId — invalidating the
    // whole feedback root is the documented choice (see hooks.ts:147).
    expect(spy).toHaveBeenCalledWith({ queryKey: feedbackKeys.all });
  });
});

describe('useDeleteFeedbackCommentMutation', () => {
  it('invalidates the entire feedback root on success', async () => {
    vi.spyOn(api, 'deleteComment').mockResolvedValue(undefined);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteFeedbackCommentMutation(), {
      wrapper: wrap(client),
    });

    await act(() => result.current.mutateAsync(COMMENT_ID));

    expect(spy).toHaveBeenCalledWith({ queryKey: feedbackKeys.all });
  });
});

describe('useSetFeedbackReactionMutation', () => {
  it('invalidates the per-thread comments on success', async () => {
    vi.spyOn(api, 'setReaction').mockResolvedValue({
      commentId: COMMENT_ID,
    } as Awaited<ReturnType<typeof api.setReaction>>);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSetFeedbackReactionMutation(), {
      wrapper: wrap(client),
    });

    await act(() =>
      result.current.mutateAsync({
        commentId: COMMENT_ID,
        reaction: 'thumbs_up',
        threadId: THREAD_ID,
      }),
    );

    expect(spy).toHaveBeenCalledWith({
      queryKey: feedbackKeys.comments(THREAD_ID),
    });
  });
});

describe('useRemoveFeedbackReactionMutation', () => {
  it('invalidates the per-thread comments on success', async () => {
    vi.spyOn(api, 'removeReaction').mockResolvedValue(undefined);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveFeedbackReactionMutation(), {
      wrapper: wrap(client),
    });

    await act(() =>
      result.current.mutateAsync({
        commentId: COMMENT_ID,
        threadId: THREAD_ID,
      }),
    );

    expect(spy).toHaveBeenCalledWith({
      queryKey: feedbackKeys.comments(THREAD_ID),
    });
  });
});

describe('useMarkFeedbackThreadReadMutation', () => {
  it('invalidates BOTH unread + inbox on success (badge + bell-icon Sheet)', async () => {
    vi.spyOn(api, 'markThreadRead').mockResolvedValue(undefined);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useMarkFeedbackThreadReadMutation(), {
      wrapper: wrap(client),
    });

    await act(() => result.current.mutateAsync(THREAD_ID));

    expect(spy).toHaveBeenCalledWith({ queryKey: feedbackKeys.unread });
    expect(spy).toHaveBeenCalledWith({ queryKey: feedbackKeys.inbox });
  });
});
