import { z } from './zod-openapi.js';

const FEEDBACK_UUID_EXAMPLE = '8d3f2a1c-9b4e-4d6f-a7c8-1e9f3a4b5c6d';
const ISO_DATETIME_EXAMPLE = '2026-06-18T08:00:00.000Z';

/**
 * Domain entities a feedback thread can attach to.
 *
 *   - `grading`   → rank_history row id
 *   - `session`   → reserved for future training-session entity
 *   - `technique` → technique row id
 *   - `pattern`   → pattern row id
 *   - `general`   → the student themself; `entityId === studentId`
 *
 * Thread identity is `(entityType, entityId, studentId)`; the backend
 * upserts on this triple so a duplicate POST returns 200 with the
 * existing row instead of 409.
 */
export const FEEDBACK_ENTITY_TYPES = [
  'grading',
  'session',
  'technique',
  'pattern',
  'general',
] as const;

export const FeedbackEntityTypeSchema = z
  .enum(FEEDBACK_ENTITY_TYPES)
  .meta({
    id: 'FeedbackEntityType',
    description: 'Domain entity a feedback thread attaches to.',
    example: 'grading',
  });

export type FeedbackEntityType = z.infer<typeof FeedbackEntityTypeSchema>;

/** Five emoji glyphs + three localised text reactions. */
export const FEEDBACK_REACTIONS = [
  'thumbs_up',
  'heart',
  'pray',
  'strong',
  'fire',
  'noted',
  'thank_you',
  'will_work_on_it',
] as const;

export const FeedbackReactionSchema = z
  .enum(FEEDBACK_REACTIONS)
  .meta({
    id: 'FeedbackReaction',
    description: 'Reaction key. The first five render as emoji glyphs; the last three render as localised text.',
    example: 'thumbs_up',
  });

export type FeedbackReaction = z.infer<typeof FeedbackReactionSchema>;

/** A reaction row on the `(comment_id, user_id)` junction. */
export const FeedbackReactionRecordSchema = z
  .object({
    commentId: z.string().uuid(),
    userId: z.string().min(1),
    reaction: FeedbackReactionSchema,
    createdAt: z.string().datetime(),
  })
  .meta({
    id: 'FeedbackReactionRecord',
    description: 'A user\'s reaction to a comment. At most one row per (comment, user); upsert-replace semantics.',
    example: {
      commentId: FEEDBACK_UUID_EXAMPLE,
      userId: 'u-instructor',
      reaction: 'thumbs_up',
      createdAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type FeedbackReactionRecord = z.infer<typeof FeedbackReactionRecordSchema>;

export const FeedbackThreadSchema = z
  .object({
    id: z.string().uuid(),
    entityType: FeedbackEntityTypeSchema,
    /** Free-form string — usually a UUID, but for `entityType='general'` equals `studentId`. */
    entityId: z.string().min(1),
    studentId: z.string().min(1),
    /**
     * Author of the thread. Nullable so the thread survives an
     * account deletion of its starter (DB column is `ON DELETE SET NULL`).
     */
    createdByUserId: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({
    id: 'FeedbackThread',
    description: 'Conversation root, keyed by (entityType, entityId, studentId).',
    example: {
      id: FEEDBACK_UUID_EXAMPLE,
      entityType: 'grading',
      entityId: FEEDBACK_UUID_EXAMPLE,
      studentId: 'u-student',
      createdByUserId: 'u-instructor',
      createdAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type FeedbackThread = z.infer<typeof FeedbackThreadSchema>;

export const FeedbackCommentSchema = z
  .object({
    id: z.string().uuid(),
    threadId: z.string().uuid(),
    authorId: z.string(),
    /** Joined display name. `null` if the user row is missing; `''` for soft-deleted comments. */
    authorName: z.string().nullable(),
    /** Reply-to parent comment id; `null` for top-level. */
    parentId: z.string().uuid().nullable(),
    body: z.string(),
    instructorOnly: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    /** Reactions on this comment; empty array when none. */
    reactions: FeedbackReactionRecordSchema.array(),
  })
  .meta({
    id: 'FeedbackComment',
    description: 'A single comment within a thread, with its reactions embedded for one-shot fetches.',
  });

export type FeedbackComment = z.infer<typeof FeedbackCommentSchema>;

export const FeedbackReadStatusSchema = z
  .object({
    threadId: z.string().uuid(),
    userId: z.string().min(1),
    lastReadAt: z.string().datetime(),
  })
  .meta({
    id: 'FeedbackReadStatus',
    description: 'Per-(thread, user) last-read timestamp driving the unread-count badge.',
  });

export type FeedbackReadStatus = z.infer<typeof FeedbackReadStatusSchema>;

export const FeedbackUnreadCountSchema = z
  .object({ count: z.number().int().nonnegative() })
  .meta({
    id: 'FeedbackUnreadCount',
    description: 'Count of threads with at least one unread visible comment for the actor.',
    example: { count: 3 },
  });

export type FeedbackUnreadCount = z.infer<typeof FeedbackUnreadCountSchema>;

// ─── Input bodies ───────────────────────────────────────────────────────────

export const CreateFeedbackThreadSchema = z
  .object({
    entityType: FeedbackEntityTypeSchema,
    entityId: z.string().min(1),
    studentId: z.string().min(1),
  })
  .meta({
    id: 'CreateFeedbackThreadInput',
    description:
      'POST /api/feedback/threads. Idempotent on (entityType, entityId, studentId): returns 200 with the existing row when a match is found, 201 with a new row otherwise.',
  });

export type CreateFeedbackThreadInput = z.infer<typeof CreateFeedbackThreadSchema>;

export const CreateFeedbackCommentSchema = z
  .object({
    body: z.string().min(1).max(5000),
    parentId: z.string().uuid().nullable().optional(),
    instructorOnly: z.boolean().optional().default(false),
  })
  .meta({
    id: 'CreateFeedbackCommentInput',
    description:
      'POST /api/feedback/threads/:threadId/comments. `instructorOnly` is forced to `false` server-side when the actor is the thread\'s student.',
  });

export type CreateFeedbackCommentInput = z.infer<typeof CreateFeedbackCommentSchema>;

export const UpdateFeedbackCommentSchema = z
  .object({
    body: z.string().min(1).max(5000),
  })
  .meta({
    id: 'UpdateFeedbackCommentInput',
    description: 'PATCH /api/feedback/comments/:id. Author-only, 24-hour window.',
  });

export type UpdateFeedbackCommentInput = z.infer<typeof UpdateFeedbackCommentSchema>;

export const SetFeedbackReactionSchema = z
  .object({
    reaction: FeedbackReactionSchema,
  })
  .meta({
    id: 'SetFeedbackReactionInput',
    description: 'PUT /api/feedback/comments/:id/reactions. Upsert-replace: removes any existing reaction by the actor on this comment first.',
  });

export type SetFeedbackReactionInput = z.infer<typeof SetFeedbackReactionSchema>;

// ─── Query schemas ──────────────────────────────────────────────────────────

export const GetFeedbackThreadQuerySchema = z
  .object({
    entityType: FeedbackEntityTypeSchema,
    entityId: z.string().min(1),
    studentId: z.string().min(1),
  })
  .meta({
    id: 'GetFeedbackThreadQuery',
    description: 'GET /api/feedback/threads — all three keys required; returns the single matching thread or null.',
  });

export type GetFeedbackThreadQuery = z.infer<typeof GetFeedbackThreadQuerySchema>;

// ─── Wrapped responses ──────────────────────────────────────────────────────

export const FeedbackThreadOrNullResponseSchema = z
  .object({ thread: FeedbackThreadSchema.nullable() })
  .meta({
    id: 'FeedbackThreadOrNullResponse',
    description: 'Wraps the nullable result of GET /api/feedback/threads — Zod cannot serialise a bare null at the top level.',
  });

export const ListFeedbackThreadsResponseSchema = z
  .object({ data: FeedbackThreadSchema.array() })
  .meta({ id: 'ListFeedbackThreadsResponse' });

export const ListFeedbackCommentsResponseSchema = z
  .object({ data: FeedbackCommentSchema.array() })
  .meta({ id: 'ListFeedbackCommentsResponse' });

export const FeedbackOpenApiRegistry = {
  FeedbackEntityType: FeedbackEntityTypeSchema,
  FeedbackReaction: FeedbackReactionSchema,
  FeedbackReactionRecord: FeedbackReactionRecordSchema,
  FeedbackThread: FeedbackThreadSchema,
  FeedbackComment: FeedbackCommentSchema,
  FeedbackReadStatus: FeedbackReadStatusSchema,
  FeedbackUnreadCount: FeedbackUnreadCountSchema,
  CreateFeedbackThreadInput: CreateFeedbackThreadSchema,
  CreateFeedbackCommentInput: CreateFeedbackCommentSchema,
  UpdateFeedbackCommentInput: UpdateFeedbackCommentSchema,
  SetFeedbackReactionInput: SetFeedbackReactionSchema,
  GetFeedbackThreadQuery: GetFeedbackThreadQuerySchema,
  FeedbackThreadOrNullResponse: FeedbackThreadOrNullResponseSchema,
  ListFeedbackThreadsResponse: ListFeedbackThreadsResponseSchema,
  ListFeedbackCommentsResponse: ListFeedbackCommentsResponseSchema,
} as const;
