import {
  CreateFeedbackCommentSchema,
  CreateFeedbackThreadSchema,
  FeedbackCommentSchema,
  FeedbackInboxResponseSchema,
  FeedbackReactionRecordSchema,
  FeedbackThreadOrNullResponseSchema,
  FeedbackThreadSchema,
  FeedbackUnreadCountSchema,
  ListFeedbackCommentsResponseSchema,
  ListFeedbackThreadsResponseSchema,
  type CreateFeedbackCommentInput,
  type CreateFeedbackThreadInput,
  type FeedbackComment,
  type FeedbackEntityType,
  type FeedbackInboxItem,
  type FeedbackReaction,
  type FeedbackReactionRecord,
  type FeedbackThread,
  type FeedbackUnreadCount,
  type SetFeedbackReactionInput,
  type UpdateFeedbackCommentInput,
} from '@repo/contracts/feedback';
import { FeedbackRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the instructor-feedback feature. Every response
 * is parsed with the contract Zod schemas so the SPA can't drift away
 * from the backend's actual shape. All routes 404 when the
 * `instructor-feedback` feature flag is off, so callers must be
 * mounted behind the same flag.
 */

export interface GetThreadKey {
  entityType: FeedbackEntityType;
  entityId: string;
  studentId: string;
}

export async function getThread({
  entityType,
  entityId,
  studentId,
}: GetThreadKey): Promise<FeedbackThread | null> {
  const params = new URLSearchParams({ entityType, entityId, studentId });
  const raw = await httpClient(`${FeedbackRoutes.threads}?${params.toString()}`);
  return FeedbackThreadOrNullResponseSchema.parse(raw).thread;
}

export async function getStudentThreads(
  studentId: string,
): Promise<FeedbackThread[]> {
  const raw = await httpClient(FeedbackRoutes.threadsByStudent(studentId));
  return ListFeedbackThreadsResponseSchema.parse(raw).data;
}

export async function createThread(
  input: CreateFeedbackThreadInput,
): Promise<FeedbackThread> {
  // Re-parse the input with the contract schema so a stale call site
  // can't smuggle through extra fields the backend would reject.
  const body = CreateFeedbackThreadSchema.parse(input);
  const raw = await httpClient(FeedbackRoutes.threads, {
    method: 'POST',
    body,
  });
  return FeedbackThreadSchema.parse(raw);
}

export async function getComments(threadId: string): Promise<FeedbackComment[]> {
  const raw = await httpClient(FeedbackRoutes.threadComments(threadId));
  return ListFeedbackCommentsResponseSchema.parse(raw).data;
}

export async function createComment(
  threadId: string,
  input: CreateFeedbackCommentInput,
): Promise<FeedbackComment> {
  const body = CreateFeedbackCommentSchema.parse(input);
  const raw = await httpClient(FeedbackRoutes.threadComments(threadId), {
    method: 'POST',
    body,
  });
  return FeedbackCommentSchema.parse(raw);
}

export async function updateComment(
  commentId: string,
  input: UpdateFeedbackCommentInput,
): Promise<FeedbackComment> {
  const raw = await httpClient(FeedbackRoutes.commentById(commentId), {
    method: 'PATCH',
    body: input,
  });
  return FeedbackCommentSchema.parse(raw);
}

export async function deleteComment(commentId: string): Promise<void> {
  await httpClient(FeedbackRoutes.commentById(commentId), { method: 'DELETE' });
}

export async function setReaction(
  commentId: string,
  reaction: FeedbackReaction,
): Promise<FeedbackReactionRecord> {
  const body: SetFeedbackReactionInput = { reaction };
  const raw = await httpClient(FeedbackRoutes.commentReactions(commentId), {
    method: 'PUT',
    body,
  });
  return FeedbackReactionRecordSchema.parse(raw);
}

export async function removeReaction(commentId: string): Promise<void> {
  await httpClient(FeedbackRoutes.commentReactions(commentId), {
    method: 'DELETE',
  });
}

export async function markThreadRead(threadId: string): Promise<void> {
  await httpClient(FeedbackRoutes.threadRead(threadId), { method: 'POST' });
}

export async function getUnreadCount(): Promise<FeedbackUnreadCount> {
  const raw = await httpClient(FeedbackRoutes.unreadCount);
  return FeedbackUnreadCountSchema.parse(raw);
}

export async function getInbox(): Promise<FeedbackInboxItem[]> {
  const raw = await httpClient(FeedbackRoutes.inbox);
  return FeedbackInboxResponseSchema.parse(raw).data;
}
