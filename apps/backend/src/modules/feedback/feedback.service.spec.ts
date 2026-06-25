import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import type {
  DbFeedbackComment,
  DbFeedbackReaction,
  DbFeedbackThread,
} from '../../infrastructure/database/schema/index.js';

import { FeedbackRepository } from './feedback.repository.js';
import { FeedbackService } from './feedback.service.js';

/**
 * Acceptance tests for the instructor-feedback feature — 17 cases pulled
 * directly from the spec:
 *
 *   - 6 access-matrix tests (subject / sysadmin / club-admin / linked
 *     instructor / grading examiner / unrelated user).
 *   - 3 edit-window + author tests (within window, non-author, expired).
 *   - 2 delete tests (soft when replies exist, hard when leaf).
 *   - 3 instructor-only visibility tests (student-list filter, instructor
 *     filter, and the student-cannot-flag rule on create).
 *   - 1 reaction visibility test (student blocked from reacting to an
 *     instructor-only comment).
 *   - 2 unread-count routing tests (sysadmin → countAll; non-sysadmin →
 *     own + instructor summed).
 *
 * The service is unit-tested with vi-mocked dependencies. The
 * grading-examiner branch hits `this.db.select(...).from(rank_history)` so
 * we stub a minimal builder chain that resolves to either an empty array
 * or one row.
 */

// ── Fixtures ───────────────────────────────────────────────────────────

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-actor',
    email: 'actor@example.com',
    emailVerified: true,
    name: 'Actor Name',
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
    ...overrides,
  };
}

function makeThread(overrides: Partial<DbFeedbackThread> = {}): DbFeedbackThread {
  return {
    id: 'thread-1',
    entityType: 'general',
    entityId: 'student-1',
    studentId: 'student-1',
    createdByUserId: 'instructor-1',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function makeComment(overrides: Partial<DbFeedbackComment> = {}): DbFeedbackComment {
  return {
    id: 'cmt-1',
    threadId: 'thread-1',
    authorId: 'u-actor',
    parentId: null,
    body: 'hello',
    instructorOnly: false,
    createdAt: new Date('2026-06-23T12:00:00Z'),
    updatedAt: new Date('2026-06-23T12:00:00Z'),
    ...overrides,
  };
}

interface Harness {
  service: FeedbackService;
  repo: {
    findThread: ReturnType<typeof vi.fn>;
    findThreadById: ReturnType<typeof vi.fn>;
    listThreadsByStudent: ReturnType<typeof vi.fn>;
    insertThread: ReturnType<typeof vi.fn>;
    listCommentsByThread: ReturnType<typeof vi.fn>;
    findCommentById: ReturnType<typeof vi.fn>;
    commentHasReplies: ReturnType<typeof vi.fn>;
    insertComment: ReturnType<typeof vi.fn>;
    updateCommentBody: ReturnType<typeof vi.fn>;
    softDeleteComment: ReturnType<typeof vi.fn>;
    hardDeleteComment: ReturnType<typeof vi.fn>;
    listReactionsByCommentIds: ReturnType<typeof vi.fn>;
    upsertReaction: ReturnType<typeof vi.fn>;
    deleteReaction: ReturnType<typeof vi.fn>;
    upsertReadStatus: ReturnType<typeof vi.fn>;
    listOrgAdminOrgIds: ReturnType<typeof vi.fn>;
    isInstructorOf: ReturnType<typeof vi.fn>;
    listStudentOrgIds: ReturnType<typeof vi.fn>;
    countOwnUnread: ReturnType<typeof vi.fn>;
    countInstructorUnread: ReturnType<typeof vi.fn>;
    countAllUnread: ReturnType<typeof vi.fn>;
  };
  /** Stash the `rank_history` SELECT result the grading-examiner branch will see. */
  setRankHistoryRow: (row: { recordedByUserId: string | null; verifiedByUserId: string | null } | null) => void;
}

function build(): Harness {
  const repo = {
    findThread: vi.fn().mockResolvedValue(undefined),
    findThreadById: vi.fn().mockResolvedValue(undefined),
    listThreadsByStudent: vi.fn().mockResolvedValue([]),
    insertThread: vi.fn(),
    listCommentsByThread: vi.fn().mockResolvedValue([]),
    findCommentById: vi.fn().mockResolvedValue(undefined),
    commentHasReplies: vi.fn().mockResolvedValue(false),
    insertComment: vi.fn(),
    updateCommentBody: vi.fn(),
    softDeleteComment: vi.fn(),
    hardDeleteComment: vi.fn().mockResolvedValue(undefined),
    listReactionsByCommentIds: vi.fn().mockResolvedValue([] as DbFeedbackReaction[]),
    upsertReaction: vi.fn(),
    deleteReaction: vi.fn().mockResolvedValue(undefined),
    upsertReadStatus: vi.fn(),
    listOrgAdminOrgIds: vi.fn().mockResolvedValue([]),
    isInstructorOf: vi.fn().mockResolvedValue(false),
    listStudentOrgIds: vi.fn().mockResolvedValue([]),
    countOwnUnread: vi.fn().mockResolvedValue(0),
    countInstructorUnread: vi.fn().mockResolvedValue(0),
    countAllUnread: vi.fn().mockResolvedValue(0),
  };

  // `isGradingExaminer` does:
  //   this.db.select({...}).from(rank_history).where(...).limit(1)
  // Stub a builder whose final `.limit()` returns the stashed row(s).
  let rankHistoryRow: { recordedByUserId: string | null; verifiedByUserId: string | null } | null = null;
  const limit = vi.fn().mockImplementation(async () => (rankHistoryRow ? [rankHistoryRow] : []));
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const db = { select } as never;

  const service = new FeedbackService(db, repo as unknown as FeedbackRepository);

  return {
    service,
    repo,
    setRankHistoryRow: (row) => {
      rankHistoryRow = row;
    },
  };
}

// ── 1–6: Access matrix on getThread ────────────────────────────────────

describe('FeedbackService.getThread — access matrix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. subject (actor === studentId) can read their own thread', async () => {
    const h = build();
    h.repo.findThread.mockResolvedValue(makeThread({ studentId: 'me' }));

    const result = await h.service.getThread(makeUser({ id: 'me' }), {
      entityType: 'general',
      entityId: 'me',
      studentId: 'me',
    });

    expect(result?.studentId).toBe('me');
    // None of the relationship checks should have been consulted.
    expect(h.repo.isInstructorOf).not.toHaveBeenCalled();
    expect(h.repo.listStudentOrgIds).not.toHaveBeenCalled();
  });

  it('2. sysadmin can read any student\'s thread', async () => {
    const h = build();
    h.repo.findThread.mockResolvedValue(makeThread({ studentId: 'other-student' }));

    await expect(
      h.service.getThread(makeUser({ role: 'sysadmin' }), {
        entityType: 'general',
        entityId: 'other-student',
        studentId: 'other-student',
      }),
    ).resolves.not.toBeNull();
    expect(h.repo.isInstructorOf).not.toHaveBeenCalled();
  });

  it('3. club admin (orgadmin of an org the student is in) can read', async () => {
    const h = build();
    h.repo.findThread.mockResolvedValue(makeThread({ studentId: 'student-2' }));
    h.repo.listStudentOrgIds.mockResolvedValue(['org-shared']);

    const actor = makeUser({
      id: 'admin-1',
      memberships: [{ organisationId: 'org-shared', role: 'orgadmin' }],
    });

    await expect(
      h.service.getThread(actor, {
        entityType: 'general',
        entityId: 'student-2',
        studentId: 'student-2',
      }),
    ).resolves.not.toBeNull();
    expect(h.repo.listStudentOrgIds).toHaveBeenCalledWith('student-2');
    // Linked-instructor branch must NOT run once club-admin matched.
    expect(h.repo.isInstructorOf).not.toHaveBeenCalled();
  });

  it('4. linked instructor (instructor in shared org) can read', async () => {
    const h = build();
    h.repo.findThread.mockResolvedValue(makeThread({ studentId: 'student-3' }));
    // No orgadmin overlap.
    h.repo.listStudentOrgIds.mockResolvedValue([]);
    h.repo.isInstructorOf.mockResolvedValue(true);

    const actor = makeUser({
      id: 'instr-1',
      memberships: [{ organisationId: 'org-x', role: 'instructor' }],
    });

    await expect(
      h.service.getThread(actor, {
        entityType: 'general',
        entityId: 'student-3',
        studentId: 'student-3',
      }),
    ).resolves.not.toBeNull();
    expect(h.repo.isInstructorOf).toHaveBeenCalledWith('instr-1', 'student-3');
  });

  it('5. grading examiner (recorded/verified the rank_history row) can read a grading thread', async () => {
    const h = build();
    h.repo.findThread.mockResolvedValue(
      makeThread({ entityType: 'grading', entityId: 'rh-1', studentId: 'student-4' }),
    );
    h.repo.isInstructorOf.mockResolvedValue(false);
    h.setRankHistoryRow({ recordedByUserId: 'examiner-1', verifiedByUserId: null });

    await expect(
      h.service.getThread(makeUser({ id: 'examiner-1' }), {
        entityType: 'grading',
        entityId: 'rh-1',
        studentId: 'student-4',
      }),
    ).resolves.not.toBeNull();
  });

  it('6. unrelated user is forbidden (no relationship matches)', async () => {
    const h = build();
    h.repo.findThread.mockResolvedValue(makeThread({ studentId: 'student-5' }));
    h.repo.isInstructorOf.mockResolvedValue(false);
    h.repo.listStudentOrgIds.mockResolvedValue([]);
    h.setRankHistoryRow(null);

    await expect(
      h.service.getThread(makeUser({ id: 'rando' }), {
        entityType: 'general',
        entityId: 'student-5',
        studentId: 'student-5',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── 7–9: Author + 24h edit window on updateComment ─────────────────────

describe('FeedbackService.updateComment — author + edit window', () => {
  beforeEach(() => vi.clearAllMocks());

  it('7. author can update within the 24h window', async () => {
    const h = build();
    const created = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    h.repo.findCommentById.mockResolvedValue(
      makeComment({ authorId: 'u-actor', createdAt: created, updatedAt: created }),
    );
    h.repo.updateCommentBody.mockResolvedValue(
      makeComment({ authorId: 'u-actor', body: 'edited' }),
    );

    const out = await h.service.updateComment(makeUser({ id: 'u-actor' }), 'cmt-1', {
      body: 'edited',
    });

    expect(out.body).toBe('edited');
    expect(h.repo.updateCommentBody).toHaveBeenCalledWith('cmt-1', 'edited');
  });

  it('8. non-author is forbidden from updating', async () => {
    const h = build();
    h.repo.findCommentById.mockResolvedValue(
      makeComment({ authorId: 'someone-else', createdAt: new Date() }),
    );

    await expect(
      h.service.updateComment(makeUser({ id: 'u-actor' }), 'cmt-1', { body: 'nope' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.repo.updateCommentBody).not.toHaveBeenCalled();
  });

  it('9. author cannot update after the 24h window expires', async () => {
    const h = build();
    const tooOld = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    h.repo.findCommentById.mockResolvedValue(
      makeComment({ authorId: 'u-actor', createdAt: tooOld, updatedAt: tooOld }),
    );

    await expect(
      h.service.updateComment(makeUser({ id: 'u-actor' }), 'cmt-1', { body: 'late' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.repo.updateCommentBody).not.toHaveBeenCalled();
  });
});

// ── 10–11: deleteComment soft vs hard ──────────────────────────────────

describe('FeedbackService.deleteComment — soft vs hard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('10. soft-deletes (preserves the row) when the comment has replies', async () => {
    const h = build();
    h.repo.findCommentById.mockResolvedValue(
      makeComment({ authorId: 'u-actor', createdAt: new Date() }),
    );
    h.repo.commentHasReplies.mockResolvedValue(true);

    await h.service.deleteComment(makeUser({ id: 'u-actor' }), 'cmt-1');

    expect(h.repo.softDeleteComment).toHaveBeenCalledWith('cmt-1');
    expect(h.repo.hardDeleteComment).not.toHaveBeenCalled();
  });

  it('11. hard-deletes (removes the row) when the comment is a leaf', async () => {
    const h = build();
    h.repo.findCommentById.mockResolvedValue(
      makeComment({ authorId: 'u-actor', createdAt: new Date() }),
    );
    h.repo.commentHasReplies.mockResolvedValue(false);

    await h.service.deleteComment(makeUser({ id: 'u-actor' }), 'cmt-1');

    expect(h.repo.hardDeleteComment).toHaveBeenCalledWith('cmt-1');
    expect(h.repo.softDeleteComment).not.toHaveBeenCalled();
  });
});

// ── 12–14: Instructor-only visibility ──────────────────────────────────

describe('FeedbackService — instructor-only visibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('12. listComments excludes instructor-only rows when the actor IS the student', async () => {
    const h = build();
    h.repo.findThreadById.mockResolvedValue(
      makeThread({ studentId: 'me' }),
    );
    h.repo.listCommentsByThread.mockResolvedValue([]);

    await h.service.listComments(makeUser({ id: 'me' }), 'thread-1');

    expect(h.repo.listCommentsByThread).toHaveBeenCalledWith('thread-1', true);
  });

  it('13. listComments includes instructor-only rows when the actor is NOT the student', async () => {
    const h = build();
    h.repo.findThreadById.mockResolvedValue(
      makeThread({ studentId: 'student-x' }),
    );
    h.repo.listCommentsByThread.mockResolvedValue([]);

    await h.service.listComments(makeUser({ role: 'sysadmin' }), 'thread-1');

    expect(h.repo.listCommentsByThread).toHaveBeenCalledWith('thread-1', false);
  });

  it('14. createComment forces instructor_only=false when the actor IS the student', async () => {
    const h = build();
    h.repo.findThreadById.mockResolvedValue(makeThread({ studentId: 'me' }));
    h.repo.insertComment.mockImplementation(async (values) => makeComment(values));

    await h.service.createComment(makeUser({ id: 'me' }), 'thread-1', {
      body: 'sneaky',
      instructorOnly: true, // <-- the rule under test: must be coerced away
      parentId: null,
    });

    expect(h.repo.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ instructorOnly: false }),
    );
  });
});

// ── 15: Reactions — student cannot react to an instructor-only comment ─

describe('FeedbackService.setReaction — instructor-only block', () => {
  beforeEach(() => vi.clearAllMocks());

  it('15. student is forbidden from reacting to an instructor-only comment', async () => {
    const h = build();
    h.repo.findCommentById.mockResolvedValue(
      makeComment({ instructorOnly: true }),
    );
    h.repo.findThreadById.mockResolvedValue(makeThread({ studentId: 'me' }));

    await expect(
      h.service.setReaction(makeUser({ id: 'me' }), 'cmt-1', {
        reaction: 'thumbs_up',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.repo.upsertReaction).not.toHaveBeenCalled();
  });
});

// ── 16–17: unreadCount routing ─────────────────────────────────────────

describe('FeedbackService.unreadCount — branch routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('16. sysadmin routes to countAllUnread (no own/instructor branches)', async () => {
    const h = build();
    h.repo.countAllUnread.mockResolvedValue(42);

    const out = await h.service.unreadCount(makeUser({ role: 'sysadmin' }));

    expect(out).toBe(42);
    expect(h.repo.countAllUnread).toHaveBeenCalledWith('u-actor');
    expect(h.repo.countOwnUnread).not.toHaveBeenCalled();
    expect(h.repo.countInstructorUnread).not.toHaveBeenCalled();
  });

  it('17. non-sysadmin sums countOwnUnread + countInstructorUnread', async () => {
    const h = build();
    h.repo.countOwnUnread.mockResolvedValue(3);
    h.repo.countInstructorUnread.mockResolvedValue(7);

    const out = await h.service.unreadCount(makeUser({ role: 'user' }));

    expect(out).toBe(10);
    expect(h.repo.countAllUnread).not.toHaveBeenCalled();
  });
});
