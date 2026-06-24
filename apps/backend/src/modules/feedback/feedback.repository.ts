import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import {
  feedbackComment,
  feedbackReaction,
  feedbackReadStatus,
  feedbackThread,
  type DbFeedbackComment,
  type DbFeedbackReaction,
  type DbFeedbackThread,
} from '../../infrastructure/database/schema/index.js';
import { organisationMembership } from '../../infrastructure/database/schema/memberships.js';
import { user } from '../../infrastructure/database/schema/users.js';

import type {
  FeedbackEntityType,
  FeedbackReaction,
} from '@repo/contracts/feedback';

/** Row joined with the author's display name for the comment list. */
export interface FeedbackCommentWithAuthor extends DbFeedbackComment {
  authorName: string | null;
}

/**
 * Plain Drizzle access for the feedback feature. No business rules — the
 * service does access control + invariant enforcement.
 */
@Injectable()
export class FeedbackRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  // ── Threads ───────────────────────────────────────────────────────────

  findThread(
    entityType: FeedbackEntityType,
    entityId: string,
    studentId: string,
  ): Promise<DbFeedbackThread | undefined> {
    return this.db
      .select()
      .from(feedbackThread)
      .where(
        and(
          eq(feedbackThread.entityType, entityType),
          eq(feedbackThread.entityId, entityId),
          eq(feedbackThread.studentId, studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  findThreadById(id: string): Promise<DbFeedbackThread | undefined> {
    return this.db
      .select()
      .from(feedbackThread)
      .where(eq(feedbackThread.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  listThreadsByStudent(studentId: string): Promise<DbFeedbackThread[]> {
    return this.db
      .select()
      .from(feedbackThread)
      .where(eq(feedbackThread.studentId, studentId))
      .orderBy(desc(feedbackThread.createdAt));
  }

  async insertThread(values: {
    entityType: FeedbackEntityType;
    entityId: string;
    studentId: string;
    createdByUserId: string;
  }): Promise<DbFeedbackThread> {
    const rows = await this.db
      .insert(feedbackThread)
      .values(values)
      .returning();
    return rows[0]!;
  }

  // ── Comments ──────────────────────────────────────────────────────────

  /**
   * Loads every comment in a thread joined with the author's name. When
   * `excludeInstructorOnly` is true (i.e. the actor is the thread's
   * student) the `instructor_only = true` rows are filtered out.
   */
  async listCommentsByThread(
    threadId: string,
    excludeInstructorOnly: boolean,
  ): Promise<FeedbackCommentWithAuthor[]> {
    const rows = await this.db
      .select({
        id: feedbackComment.id,
        threadId: feedbackComment.threadId,
        authorId: feedbackComment.authorId,
        authorName: user.name,
        parentId: feedbackComment.parentId,
        body: feedbackComment.body,
        instructorOnly: feedbackComment.instructorOnly,
        createdAt: feedbackComment.createdAt,
        updatedAt: feedbackComment.updatedAt,
      })
      .from(feedbackComment)
      .leftJoin(user, eq(user.id, feedbackComment.authorId))
      .where(
        excludeInstructorOnly
          ? and(
              eq(feedbackComment.threadId, threadId),
              eq(feedbackComment.instructorOnly, false),
            )
          : eq(feedbackComment.threadId, threadId),
      )
      .orderBy(asc(feedbackComment.createdAt));
    return rows;
  }

  findCommentById(id: string): Promise<DbFeedbackComment | undefined> {
    return this.db
      .select()
      .from(feedbackComment)
      .where(eq(feedbackComment.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  async commentHasReplies(commentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: feedbackComment.id })
      .from(feedbackComment)
      .where(eq(feedbackComment.parentId, commentId))
      .limit(1);
    return rows.length > 0;
  }

  async insertComment(values: {
    threadId: string;
    authorId: string;
    parentId: string | null;
    body: string;
    instructorOnly: boolean;
  }): Promise<DbFeedbackComment> {
    const rows = await this.db
      .insert(feedbackComment)
      .values(values)
      .returning();
    return rows[0]!;
  }

  async updateCommentBody(id: string, body: string): Promise<DbFeedbackComment> {
    const rows = await this.db
      .update(feedbackComment)
      .set({ body, updatedAt: new Date() })
      .where(eq(feedbackComment.id, id))
      .returning();
    return rows[0]!;
  }

  /** Soft-delete: replace body + clear author, keep the row. */
  async softDeleteComment(id: string): Promise<DbFeedbackComment> {
    const rows = await this.db
      .update(feedbackComment)
      .set({ body: '[deleted]', authorId: '', updatedAt: new Date() })
      .where(eq(feedbackComment.id, id))
      .returning();
    return rows[0]!;
  }

  /** Hard-delete: only safe when the row has no replies. */
  async hardDeleteComment(id: string): Promise<void> {
    await this.db.delete(feedbackComment).where(eq(feedbackComment.id, id));
  }

  // ── Reactions ─────────────────────────────────────────────────────────

  listReactionsByCommentIds(commentIds: string[]): Promise<DbFeedbackReaction[]> {
    if (commentIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(feedbackReaction)
      .where(
        sql`${feedbackReaction.commentId} IN (${sql.join(
          commentIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
  }

  /** Delete-then-insert in a single transaction so the actor swaps reactions atomically. */
  async upsertReaction(
    commentId: string,
    userId: string,
    reaction: FeedbackReaction,
  ): Promise<DbFeedbackReaction> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(feedbackReaction)
        .where(
          and(
            eq(feedbackReaction.commentId, commentId),
            eq(feedbackReaction.userId, userId),
          ),
        );
      const rows = await tx
        .insert(feedbackReaction)
        .values({ commentId, userId, reaction })
        .returning();
      return rows[0]!;
    });
  }

  async deleteReaction(commentId: string, userId: string): Promise<void> {
    await this.db
      .delete(feedbackReaction)
      .where(
        and(
          eq(feedbackReaction.commentId, commentId),
          eq(feedbackReaction.userId, userId),
        ),
      );
  }

  // ── Read-status ───────────────────────────────────────────────────────

  async upsertReadStatus(
    threadId: string,
    userId: string,
  ): Promise<{ threadId: string; userId: string; lastReadAt: Date }> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      await tx
        .delete(feedbackReadStatus)
        .where(
          and(
            eq(feedbackReadStatus.threadId, threadId),
            eq(feedbackReadStatus.userId, userId),
          ),
        );
      const rows = await tx
        .insert(feedbackReadStatus)
        .values({ threadId, userId, lastReadAt: now })
        .returning();
      return rows[0]!;
    });
  }

  // ── Access-control building blocks ────────────────────────────────────

  /**
   * Org ids the actor is an `orgadmin` of. Used to scope the "club admin
   * sees their own org's threads" rule.
   */
  async listOrgAdminOrgIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ organisationId: organisationMembership.organisationId })
      .from(organisationMembership)
      .where(
        and(
          eq(organisationMembership.userId, userId),
          eq(organisationMembership.role, 'orgadmin'),
        ),
      );
    return rows.map((r) => r.organisationId);
  }

  /**
   * True iff there exists an org where the actor has `role='instructor'`
   * AND the student has a membership row (any role) in the same org. This
   * is the "linked instructor of student" check the spec calls out.
   */
  async isInstructorOf(actorId: string, studentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ orgId: organisationMembership.organisationId })
      .from(organisationMembership)
      .innerJoin(
        sql`organisation_membership AS student_m`,
        sql`student_m.organisation_id = ${organisationMembership.organisationId}`,
      )
      .where(
        and(
          eq(organisationMembership.userId, actorId),
          eq(organisationMembership.role, 'instructor'),
          sql`student_m.user_id = ${studentId}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Org ids where the student has any membership row. Joined into the
   * "club admin" rule so a club admin can read threads about a student in
   * their own org.
   */
  async listStudentOrgIds(studentId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ organisationId: organisationMembership.organisationId })
      .from(organisationMembership)
      .where(eq(organisationMembership.userId, studentId));
    return rows.map((r) => r.organisationId);
  }

  // ── Unread-count branches ─────────────────────────────────────────────

  /**
   * Threads where the actor is the student (own threads), with at least
   * one non-instructor-only comment newer than the actor's `last_read_at`.
   * The student never sees instructor-only rows so we filter them out of
   * the unread count too.
   */
  async countOwnUnread(actorId: string): Promise<number> {
    const rows = await this.db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT t.id)::int AS count
      FROM feedback_thread t
      INNER JOIN feedback_comment c
        ON c.thread_id = t.id AND c.instructor_only = false
      LEFT JOIN feedback_read_status rs
        ON rs.thread_id = t.id AND rs.user_id = ${actorId}
      WHERE t.student_id = ${actorId}
        AND (rs.last_read_at IS NULL OR c.created_at > rs.last_read_at)
    `);
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Threads where the actor is a linked instructor of the student (any
   * org where actor is `instructor` and the student also has a row), with
   * at least one comment newer than the actor's `last_read_at`. Includes
   * instructor-only comments.
   */
  async countInstructorUnread(actorId: string): Promise<number> {
    const rows = await this.db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT t.id)::int AS count
      FROM feedback_thread t
      INNER JOIN feedback_comment c ON c.thread_id = t.id
      INNER JOIN organisation_membership instructor_m
        ON instructor_m.user_id = ${actorId} AND instructor_m.role = 'instructor'
      INNER JOIN organisation_membership student_m
        ON student_m.user_id = t.student_id
       AND student_m.organisation_id = instructor_m.organisation_id
      LEFT JOIN feedback_read_status rs
        ON rs.thread_id = t.id AND rs.user_id = ${actorId}
      WHERE t.student_id != ${actorId}
        AND (rs.last_read_at IS NULL OR c.created_at > rs.last_read_at)
    `);
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Sysadmin path — counts unread across every thread, no visibility
   * filter. Spec calls this out: sysadmins see everything including
   * instructor-only.
   */
  async countAllUnread(actorId: string): Promise<number> {
    const rows = await this.db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT t.id)::int AS count
      FROM feedback_thread t
      INNER JOIN feedback_comment c ON c.thread_id = t.id
      LEFT JOIN feedback_read_status rs
        ON rs.thread_id = t.id AND rs.user_id = ${actorId}
      WHERE rs.last_read_at IS NULL OR c.created_at > rs.last_read_at
    `);
    return Number(rows[0]?.count ?? 0);
  }

  // Silence unused-import warnings for utilities reserved for future tweaks
  // of the unread-count queries (NULL handling, distinct-or-not toggles).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _unusedDirectives = [or, isNotNull, isNull];
}
