import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbFeedbackThread } from '../../infrastructure/database/schema/index.js';

import { FeedbackAccessPolicy } from './feedback.access-policy.js';
import { FeedbackRepository } from './feedback.repository.js';

/**
 * Dedicated acceptance tests for the 5-path access matrix on
 * `FeedbackAccessPolicy`. The original 17 tests in
 * `feedback.service.spec.ts` still drive the service end-to-end
 * (the harness builds a real policy and passes it in); these tests
 * are the direct unit coverage so the policy can be refactored
 * without spinning up the service tree, and so failures localise
 * to the access rules instead of being attributed to the service.
 *
 * Five access paths exercised (review § P1.2 + Chunk 6 of the
 * original feedback spec):
 *
 *   1. Subject  — actor IS the student.
 *   2. Sysadmin — always.
 *   3. Club admin — orgadmin in an org the student also belongs to.
 *   4. Linked instructor — instructor in shared org.
 *   5. Grading examiner — `rank_history.recordedBy` or `.verifiedBy`.
 *   + Unrelated — none of the above ⇒ ForbiddenException.
 *
 * Each branch is exercised in isolation by stubbing only the repo
 * paths that branch consults, AND asserts the LATER branches do NOT
 * run when an earlier one matched. That guards against a future
 * re-ordering refactor accidentally short-circuiting on the wrong
 * rule.
 */

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

interface Harness {
  policy: FeedbackAccessPolicy;
  repo: {
    listStudentOrgIds: ReturnType<typeof vi.fn>;
    isInstructorOf: ReturnType<typeof vi.fn>;
  };
  /** Stash the rank_history row the grading-examiner branch resolves to. */
  setRankHistoryRow: (
    row: { recordedByUserId: string | null; verifiedByUserId: string | null } | null,
  ) => void;
}

function build(): Harness {
  const repo = {
    // The policy only ever calls these two repo methods directly —
    // every other branch hits the actor's in-memory `memberships`
    // or the rank_history db chain below.
    listStudentOrgIds: vi.fn().mockResolvedValue([] as string[]),
    isInstructorOf: vi.fn().mockResolvedValue(false),
  };

  // Same db chain as `feedback.service.spec.ts` —
  //   db.select({...}).from(rank_history).where(...).limit(1)
  // — driven through a stashable fixture row.
  let rankHistoryRow: { recordedByUserId: string | null; verifiedByUserId: string | null } | null =
    null;
  const limit = vi
    .fn()
    .mockImplementation(async () => (rankHistoryRow ? [rankHistoryRow] : []));
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const db = { select } as never;

  const policy = new FeedbackAccessPolicy(db, repo as unknown as FeedbackRepository);

  return {
    policy,
    repo,
    setRankHistoryRow: (row) => {
      rankHistoryRow = row;
    },
  };
}

describe('FeedbackAccessPolicy.assertAccessForKey — access matrix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. subject (actor === studentId) sees their own thread', async () => {
    const h = build();
    await expect(
      h.policy.assertAccessForKey(makeUser({ id: 'me' }), 'me', 'general', 'me'),
    ).resolves.toBeUndefined();
    // None of the relationship checks should have been consulted.
    expect(h.repo.isInstructorOf).not.toHaveBeenCalled();
    expect(h.repo.listStudentOrgIds).not.toHaveBeenCalled();
  });

  it('2. sysadmin sees any thread without consulting relationships', async () => {
    const h = build();
    await expect(
      h.policy.assertAccessForKey(
        makeUser({ role: 'sysadmin' }),
        'other-student',
        'general',
        'other-student',
      ),
    ).resolves.toBeUndefined();
    expect(h.repo.isInstructorOf).not.toHaveBeenCalled();
    expect(h.repo.listStudentOrgIds).not.toHaveBeenCalled();
  });

  it('3. club admin (orgadmin in shared org) sees the student', async () => {
    const h = build();
    h.repo.listStudentOrgIds.mockResolvedValue(['org-shared']);

    const actor = makeUser({
      id: 'admin-1',
      memberships: [{ organisationId: 'org-shared', role: 'orgadmin' }],
    });

    await expect(
      h.policy.assertAccessForKey(actor, 'student-2', 'general', 'student-2'),
    ).resolves.toBeUndefined();
    expect(h.repo.listStudentOrgIds).toHaveBeenCalledWith('student-2');
    // Linked-instructor branch must NOT run once club-admin matched.
    expect(h.repo.isInstructorOf).not.toHaveBeenCalled();
  });

  it('4. linked instructor (instructor in shared org) sees the student', async () => {
    const h = build();
    h.repo.listStudentOrgIds.mockResolvedValue([]);
    h.repo.isInstructorOf.mockResolvedValue(true);

    const actor = makeUser({
      id: 'instr-1',
      memberships: [{ organisationId: 'org-x', role: 'instructor' }],
    });

    await expect(
      h.policy.assertAccessForKey(actor, 'student-3', 'general', 'student-3'),
    ).resolves.toBeUndefined();
    expect(h.repo.isInstructorOf).toHaveBeenCalledWith('instr-1', 'student-3');
  });

  it('5. grading examiner (recorded/verified rank_history) sees a grading thread', async () => {
    const h = build();
    h.repo.isInstructorOf.mockResolvedValue(false);
    h.setRankHistoryRow({ recordedByUserId: 'examiner-1', verifiedByUserId: null });

    await expect(
      h.policy.assertAccessForKey(
        makeUser({ id: 'examiner-1' }),
        'student-4',
        'grading',
        'rh-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('grading-examiner branch ALSO accepts the verifier (not just the recorder)', async () => {
    const h = build();
    h.repo.isInstructorOf.mockResolvedValue(false);
    h.setRankHistoryRow({ recordedByUserId: null, verifiedByUserId: 'examiner-1' });

    await expect(
      h.policy.assertAccessForKey(
        makeUser({ id: 'examiner-1' }),
        'student-4',
        'grading',
        'rh-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('grading-examiner branch does NOT fire when entityType is not "grading"', async () => {
    const h = build();
    h.repo.isInstructorOf.mockResolvedValue(false);
    // Even with a matching rank_history row, the branch must not
    // engage when the thread is technique/pattern/general.
    h.setRankHistoryRow({ recordedByUserId: 'examiner-1', verifiedByUserId: null });

    await expect(
      h.policy.assertAccessForKey(
        makeUser({ id: 'examiner-1' }),
        'student-4',
        'technique',
        'tech-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('6. unrelated user is forbidden (no relationship matches)', async () => {
    const h = build();
    h.repo.isInstructorOf.mockResolvedValue(false);
    h.repo.listStudentOrgIds.mockResolvedValue([]);
    h.setRankHistoryRow(null);

    await expect(
      h.policy.assertAccessForKey(
        makeUser({ id: 'rando' }),
        'student-5',
        'general',
        'student-5',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FeedbackAccessPolicy.assertAccessToThread', () => {
  it('delegates to assertAccessForKey with the thread keys', async () => {
    const h = build();
    const thread = makeThread({
      entityType: 'grading',
      entityId: 'rh-1',
      studentId: 'student-grading',
    });
    h.repo.isInstructorOf.mockResolvedValue(false);
    h.repo.listStudentOrgIds.mockResolvedValue([]);
    h.setRankHistoryRow({ recordedByUserId: 'examiner-1', verifiedByUserId: null });

    // The wrapper should compose into the grading-examiner branch.
    await expect(
      h.policy.assertAccessToThread(makeUser({ id: 'examiner-1' }), thread),
    ).resolves.toBeUndefined();
  });
});
