import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  CreateFeedbackCommentInput,
  CreateFeedbackThreadInput,
  FeedbackComment,
  FeedbackEntityType,
  FeedbackInboxItem,
  FeedbackReaction,
  FeedbackReactionRecord,
  FeedbackThread,
  FeedbackUnreadCount,
  UpdateFeedbackCommentInput,
} from '@repo/contracts/feedback';

import * as api from '../api/feedback.api.js';

/**
 * React Query hooks for the Feedback module.
 *
 * Query keys are namespaced under `['feedback', ...]` so a coarse
 * `invalidateQueries({ queryKey: ['feedback'] })` after a mutation
 * sweeps every cached thread/comments/unread variant. Per-thread keys
 * are included alongside the coarse `feedback` root so per-comment
 * mutations can target just one thread when they want to.
 */
export const feedbackKeys = {
  all: ['feedback'] as const,
  thread: (entityType: FeedbackEntityType, entityId: string, studentId: string) =>
    ['feedback', 'thread', entityType, entityId, studentId] as const,
  studentThreads: (studentId: string) =>
    ['feedback', 'student-threads', studentId] as const,
  comments: (threadId: string) =>
    ['feedback', 'comments', threadId] as const,
  unread: ['feedback', 'unread'] as const,
  inbox: ['feedback', 'inbox'] as const,
};

export function useFeedbackThreadQuery(
  key: { entityType: FeedbackEntityType; entityId: string; studentId: string } | null,
): UseQueryResult<FeedbackThread | null> {
  return useQuery({
    queryKey: key
      ? feedbackKeys.thread(key.entityType, key.entityId, key.studentId)
      : ['feedback', 'thread', 'disabled'],
    queryFn: () =>
      api.getThread({
        entityType: key!.entityType,
        entityId: key!.entityId,
        studentId: key!.studentId,
      }),
    enabled: key !== null,
  });
}

export function useStudentFeedbackThreadsQuery(
  studentId: string | null,
): UseQueryResult<FeedbackThread[]> {
  return useQuery({
    queryKey: feedbackKeys.studentThreads(studentId ?? ''),
    queryFn: () => api.getStudentThreads(studentId!),
    enabled: !!studentId,
  });
}

export function useFeedbackCommentsQuery(
  threadId: string | null,
): UseQueryResult<FeedbackComment[]> {
  return useQuery({
    queryKey: feedbackKeys.comments(threadId ?? ''),
    queryFn: () => api.getComments(threadId!),
    enabled: !!threadId,
  });
}

/**
 * Badge polling. 60-second refetch interval is the spec's value;
 * `refetchOnWindowFocus` (TanStack default) also kicks in on tab focus
 * so a returning user sees a fresh count without waiting for the next
 * tick.
 */
export function useFeedbackUnreadCountQuery(): UseQueryResult<FeedbackUnreadCount> {
  return useQuery({
    queryKey: feedbackKeys.unread,
    queryFn: () => api.getUnreadCount(),
    refetchInterval: 60_000,
  });
}

/**
 * Lazy inbox query — fed by the bell-icon Sheet. Disabled until the
 * sheet opens so we don't fan out the join-heavy SELECT on every
 * authenticated request.
 */
export function useFeedbackInboxQuery(
  enabled: boolean,
): UseQueryResult<FeedbackInboxItem[]> {
  return useQuery({
    queryKey: feedbackKeys.inbox,
    queryFn: () => api.getInbox(),
    enabled,
  });
}

export function useCreateFeedbackThreadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFeedbackThreadInput) => api.createThread(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}

export function useCreateFeedbackCommentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      input,
    }: {
      threadId: string;
      input: CreateFeedbackCommentInput;
    }) => api.createComment(threadId, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.comments(vars.threadId) });
      void qc.invalidateQueries({ queryKey: feedbackKeys.unread });
    },
  });
}

export function useUpdateFeedbackCommentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      input,
    }: {
      commentId: string;
      input: UpdateFeedbackCommentInput;
    }) => api.updateComment(commentId, input),
    onSuccess: () => {
      // Comment id alone doesn't carry the threadId; invalidate the
      // whole feedback root rather than threading the threadId through
      // every call site. Cheap — only the currently mounted thread is
      // a live query.
      void qc.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}

export function useDeleteFeedbackCommentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}

export interface SetReactionVars {
  commentId: string;
  reaction: FeedbackReaction;
  threadId: string;
}

export function useSetFeedbackReactionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, reaction }: SetReactionVars): Promise<FeedbackReactionRecord> =>
      api.setReaction(commentId, reaction),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.comments(vars.threadId) });
    },
  });
}

export function useRemoveFeedbackReactionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: { commentId: string; threadId: string }) =>
      api.removeReaction(commentId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.comments(vars.threadId) });
    },
  });
}

export function useMarkFeedbackThreadReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.markThreadRead(threadId),
    onSuccess: () => {
      // Both the badge count AND the bell's inbox list need to refresh —
      // otherwise a thread the user just finished reading stays in the
      // bell's open Sheet until the next 60-second poll.
      void qc.invalidateQueries({ queryKey: feedbackKeys.unread });
      void qc.invalidateQueries({ queryKey: feedbackKeys.inbox });
    },
  });
}
