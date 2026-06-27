import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  CreateFeedbackCommentInput,
  CreateFeedbackThreadInput,
  FeedbackComment,
  FeedbackEntityType,
  FeedbackInboxItem,
  FeedbackReaction as FeedbackReactionKey,
  FeedbackReactionRecord,
  FeedbackThread,
  GetFeedbackThreadQuery,
  SetFeedbackReactionInput,
  UpdateFeedbackCommentInput,
} from '@repo/contracts/feedback';

import {
  type DbFeedbackComment,
  type DbFeedbackReaction,
  type DbFeedbackThread,
} from '../../infrastructure/database/schema/index.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { FeedbackAccessPolicy } from './feedback.access-policy.js';
import { FeedbackRepository } from './feedback.repository.js';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Business logic for the instructor-feedback feature. Access control
 * lives in {@link FeedbackAccessPolicy} — this service delegates to
 * it for every read/write that touches a thread; what's left here is
 * the create/edit/delete + reaction + read-status + inbox logic.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly repo: FeedbackRepository,
    private readonly access: FeedbackAccessPolicy,
  ) {}

  // ── Threads ───────────────────────────────────────────────────────────

  async getThread(
    actor: AuthenticatedUser,
    query: GetFeedbackThreadQuery,
  ): Promise<FeedbackThread | null> {
    await this.access.assertAccessForKey(
      actor,
      query.studentId,
      query.entityType,
      query.entityId,
    );
    const row = await this.repo.findThread(
      query.entityType,
      query.entityId,
      query.studentId,
    );
    return row ? this.toThread(row) : null;
  }

  async listThreadsByStudent(
    actor: AuthenticatedUser,
    studentId: string,
  ): Promise<FeedbackThread[]> {
    await this.access.assertAccessForKey(actor, studentId);
    const rows = await this.repo.listThreadsByStudent(studentId);
    return rows.map((r) => this.toThread(r));
  }

  /**
   * Idempotent on (entityType, entityId, studentId): returns the existing
   * thread when the triple already has one, otherwise inserts and returns
   * the new row. The HTTP controller maps the boolean back to 200/201.
   */
  async upsertThread(
    actor: AuthenticatedUser,
    input: CreateFeedbackThreadInput,
  ): Promise<{ thread: FeedbackThread; created: boolean }> {
    await this.access.assertAccessForKey(
      actor,
      input.studentId,
      input.entityType,
      input.entityId,
    );
    const existing = await this.repo.findThread(
      input.entityType,
      input.entityId,
      input.studentId,
    );
    if (existing) {
      return { thread: this.toThread(existing), created: false };
    }
    const inserted = await this.repo.insertThread({
      entityType: input.entityType,
      entityId: input.entityId,
      studentId: input.studentId,
      createdByUserId: actor.id,
    });
    return { thread: this.toThread(inserted), created: true };
  }

  // ── Comments ──────────────────────────────────────────────────────────

  async listComments(
    actor: AuthenticatedUser,
    threadId: string,
  ): Promise<FeedbackComment[]> {
    const thread = await this.requireThread(threadId);
    await this.access.assertAccessToThread(actor, thread);
    const isStudent = actor.id === thread.studentId;
    const rows = await this.repo.listCommentsByThread(threadId, isStudent);
    const reactions = await this.repo.listReactionsByCommentIds(
      rows.map((r) => r.id),
    );
    const byComment = new Map<string, DbFeedbackReaction[]>();
    for (const rx of reactions) {
      const bucket = byComment.get(rx.commentId) ?? [];
      bucket.push(rx);
      byComment.set(rx.commentId, bucket);
    }
    return rows.map((row) =>
      this.toComment(row, row.authorName, byComment.get(row.id) ?? []),
    );
  }

  async createComment(
    actor: AuthenticatedUser,
    threadId: string,
    input: CreateFeedbackCommentInput,
  ): Promise<FeedbackComment> {
    const thread = await this.requireThread(threadId);
    await this.access.assertAccessToThread(actor, thread);

    // Students may never post instructor-only comments. Force the flag
    // server-side regardless of the request body.
    const isStudent = actor.id === thread.studentId;
    const instructorOnly = isStudent ? false : input.instructorOnly === true;

    const inserted = await this.repo.insertComment({
      threadId,
      authorId: actor.id,
      parentId: input.parentId ?? null,
      body: input.body,
      instructorOnly,
    });
    return this.toComment(inserted, actor.name ?? null, []);
  }

  async updateComment(
    actor: AuthenticatedUser,
    commentId: string,
    input: UpdateFeedbackCommentInput,
  ): Promise<FeedbackComment> {
    const comment = await this.requireComment(commentId);
    this.assertAuthorAndWithinWindow(actor, comment);
    const updated = await this.repo.updateCommentBody(commentId, input.body);
    return this.toComment(updated, actor.name ?? null, []);
  }

  async deleteComment(
    actor: AuthenticatedUser,
    commentId: string,
  ): Promise<void> {
    const comment = await this.requireComment(commentId);
    this.assertAuthorAndWithinWindow(actor, comment);

    // Soft-delete if there are replies (preserve the tree); otherwise
    // hard-delete the leaf row.
    const hasReplies = await this.repo.commentHasReplies(commentId);
    if (hasReplies) {
      await this.repo.softDeleteComment(commentId);
    } else {
      await this.repo.hardDeleteComment(commentId);
    }
  }

  // ── Reactions ─────────────────────────────────────────────────────────

  async setReaction(
    actor: AuthenticatedUser,
    commentId: string,
    input: SetFeedbackReactionInput,
  ): Promise<FeedbackReactionRecord> {
    const comment = await this.requireComment(commentId);
    const thread = await this.requireThread(comment.threadId);
    await this.access.assertAccessToThread(actor, thread);
    // A student can react to a comment they can see, so the instructor-
    // only visibility filter at list-time is enough to prevent them
    // reacting to hidden rows in practice — the API still rejects
    // explicitly:
    if (actor.id === thread.studentId && comment.instructorOnly) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Comment not visible.' },
      });
    }
    const row = await this.repo.upsertReaction(
      commentId,
      actor.id,
      input.reaction as FeedbackReactionKey,
    );
    return this.toReaction(row);
  }

  async removeReaction(
    actor: AuthenticatedUser,
    commentId: string,
  ): Promise<void> {
    const comment = await this.requireComment(commentId);
    const thread = await this.requireThread(comment.threadId);
    await this.access.assertAccessToThread(actor, thread);
    await this.repo.deleteReaction(commentId, actor.id);
  }

  // ── Read status + unread count ────────────────────────────────────────

  async markRead(actor: AuthenticatedUser, threadId: string): Promise<void> {
    const thread = await this.requireThread(threadId);
    await this.access.assertAccessToThread(actor, thread);
    await this.repo.upsertReadStatus(threadId, actor.id);
  }

  async unreadCount(actor: AuthenticatedUser): Promise<number> {
    if (actor.role === 'sysadmin') {
      return this.repo.countAllUnread(actor.id);
    }
    const own = await this.repo.countOwnUnread(actor.id);
    const instructor = await this.repo.countInstructorUnread(actor.id);
    return own + instructor;
  }

  /**
   * Bell-icon inbox. Branches mirror {@link unreadCount} — sysadmin sees
   * every unread thread; non-sysadmin sees own + instructor-linked. The
   * two non-sysadmin lists are merged, deduplicated by `threadId` (a
   * sysadmin who is also a student wouldn't hit this branch, but a
   * student who is also an instructor in a separate org could
   * conceivably surface the same thread twice in the linked-instructor
   * branch — we keep the higher unread count just in case), and sorted
   * by `lastActivityAt` DESC.
   */
  async getInbox(actor: AuthenticatedUser): Promise<FeedbackInboxItem[]> {
    const rows =
      actor.role === 'sysadmin'
        ? await this.repo.listAllInboxItems(actor.id)
        : [
            ...(await this.repo.listOwnInboxItems(actor.id)),
            ...(await this.repo.listInstructorInboxItems(actor.id)),
          ];

    const byThread = new Map<string, FeedbackInboxItem>();
    for (const r of rows) {
      const existing = byThread.get(r.thread_id);
      const item: FeedbackInboxItem = {
        threadId: r.thread_id,
        entityType: r.entity_type as FeedbackEntityType,
        entityId: r.entity_id,
        studentId: r.student_id,
        studentName: r.student_name,
        contextLabel: r.context_label,
        unreadCount: Number(r.unread_count),
        // `db.execute` returns timestamps as ISO strings, not Date — the
        // postgres-js → Drizzle row mapper only does the Date coercion for
        // query-builder reads. Wrap in `new Date(...)` so the input is
        // either accepted and re-stringified.
        lastActivityAt: new Date(r.last_activity_at).toISOString(),
      };
      if (!existing || existing.unreadCount < item.unreadCount) {
        byThread.set(r.thread_id, item);
      }
    }

    return Array.from(byThread.values()).sort((a, b) =>
      a.lastActivityAt < b.lastActivityAt ? 1 : -1,
    );
  }

  // ── Author + edit-window guard ────────────────────────────────────────

  private assertAuthorAndWithinWindow(
    actor: AuthenticatedUser,
    comment: DbFeedbackComment,
  ): void {
    if (comment.authorId !== actor.id) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Only the author can edit or delete.' },
      });
    }
    const ageMs = Date.now() - comment.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Comments are read-only after 24 hours.',
        },
      });
    }
  }

  // ── Loaders ───────────────────────────────────────────────────────────

  private async requireThread(id: string): Promise<DbFeedbackThread> {
    const row = await this.repo.findThreadById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Thread ${id} not found.` },
      });
    }
    return row;
  }

  private async requireComment(id: string): Promise<DbFeedbackComment> {
    const row = await this.repo.findCommentById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Comment ${id} not found.` },
      });
    }
    return row;
  }

  // ── DB → API mappers ──────────────────────────────────────────────────

  private toThread(row: DbFeedbackThread): FeedbackThread {
    return {
      id: row.id,
      entityType: row.entityType as FeedbackEntityType,
      entityId: row.entityId,
      studentId: row.studentId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toComment(
    row: DbFeedbackComment,
    authorName: string | null,
    reactions: DbFeedbackReaction[],
  ): FeedbackComment {
    return {
      id: row.id,
      threadId: row.threadId,
      authorId: row.authorId,
      authorName,
      parentId: row.parentId,
      body: row.body,
      instructorOnly: row.instructorOnly,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reactions: reactions.map((r) => this.toReaction(r)),
    };
  }

  private toReaction(row: DbFeedbackReaction): FeedbackReactionRecord {
    return {
      commentId: row.commentId,
      userId: row.userId,
      reaction: row.reaction as FeedbackReactionKey,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Silence linter complaints about `ConflictException` being imported
   * but unused — we keep the import to make it easy to wire 409 paths
   * later (e.g. a unique-violation race-condition handler for thread
   * upsert).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _conflictReserved = ConflictException;
}
