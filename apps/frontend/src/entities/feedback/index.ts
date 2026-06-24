export {
  FEEDBACK_ENTITY_TYPES,
  FEEDBACK_REACTIONS,
  type FeedbackComment,
  type FeedbackEntityType,
  type FeedbackReaction,
  type FeedbackReactionRecord,
  type FeedbackThread,
  type FeedbackUnreadCount,
  type CreateFeedbackCommentInput,
  type CreateFeedbackThreadInput,
  type UpdateFeedbackCommentInput,
} from '@repo/contracts/feedback';

export * as feedbackApi from './api/feedback.api.js';

export {
  feedbackKeys,
  useFeedbackThreadQuery,
  useStudentFeedbackThreadsQuery,
  useFeedbackCommentsQuery,
  useFeedbackUnreadCountQuery,
  useCreateFeedbackThreadMutation,
  useCreateFeedbackCommentMutation,
  useUpdateFeedbackCommentMutation,
  useDeleteFeedbackCommentMutation,
  useSetFeedbackReactionMutation,
  useRemoveFeedbackReactionMutation,
  useMarkFeedbackThreadReadMutation,
} from './lib/hooks.js';
