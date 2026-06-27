import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { FeedbackEntityType } from '@repo/contracts/feedback';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { rankHistory } from '../../infrastructure/database/schema/rank-history.js';
import { type DbFeedbackThread } from '../../infrastructure/database/schema/index.js';

import { FeedbackRepository } from './feedback.repository.js';

/**
 * Access policy for the instructor-feedback feature.
 *
 * The matrix is procedural (not CASL conditions) because the rules
 * cross several tables: `organisation_membership` is consulted in both
 * directions (the actor's memberships AND the student's memberships),
 * and the grading-examiner branch reads from `rank_history`. CASL's
 * Mongo-style condition matcher can express simple instance scopes
 * (e.g. orgadmin manages org X's rows) but can't model "actor is the
 * recorder OR verifier of a rank_history row whose id we don't know
 * until request time."
 *
 * Five allow paths, evaluated in order:
 *
 *   1. **Subject** — actor IS the student. Always sees their own thread.
 *   2. **Sysadmin** — bypasses every other check. The 17 acceptance
 *      tests pin this branch in particular because impersonation
 *      makes it easy to forget that a sysadmin token is unconditionally
 *      allowed.
 *   3. **Club admin** — actor is `orgadmin` in an organisation the
 *      student is ALSO a member of. Requires a DB lookup for the
 *      student's org list.
 *   4. **Linked instructor** — actor is `instructor` in an org where
 *      the student also has a membership row of any role. Single
 *      organisation_membership self-join (`isInstructorOf`).
 *   5. **Grading examiner** — only meaningful when `entityType =
 *      'grading'`. The actor either recorded or verified the
 *      rank_history row referenced by `entityId`. Adapts the spec's
 *      `grading_event_officers` concept (no table in this codebase)
 *      to what taidohub does have.
 *
 * Extracted from `FeedbackService` so the access matrix is:
 *   - testable in isolation without spinning up the rest of the
 *     service tree (the dedicated `feedback.access-policy.spec.ts`
 *     drives the 6 access-matrix scenarios directly); and
 *   - reusable wherever the access decision is needed without
 *     pulling in the rest of FeedbackService's surface area.
 */
@Injectable()
export class FeedbackAccessPolicy {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly repo: FeedbackRepository,
  ) {}

  /**
   * Asserts the actor may read/write threads keyed by the given
   * `studentId`. The optional `entityType` + `entityId` only matter
   * for the grading-examiner branch; pass them when known so a
   * grading thread can resolve to access even when the actor isn't
   * any of subject/sysadmin/club-admin/linked-instructor.
   *
   * Throws a {@link ForbiddenException} with the contracts-defined
   * `FORBIDDEN` error code if none of the five rules match.
   */
  async assertAccessForKey(
    actor: AuthenticatedUser,
    studentId: string,
    entityType?: FeedbackEntityType,
    entityId?: string,
  ): Promise<void> {
    // 1. Subject.
    if (actor.id === studentId) return;
    // 2. Sysadmin.
    if (actor.role === 'sysadmin') return;
    // 3. Club admin — orgadmin of an org the student is in.
    const orgAdminOrgs = actor.memberships
      .filter((m) => m.role === 'orgadmin')
      .map((m) => m.organisationId);
    if (orgAdminOrgs.length > 0) {
      const studentOrgs = await this.repo.listStudentOrgIds(studentId);
      if (studentOrgs.some((id) => orgAdminOrgs.includes(id))) return;
    }
    // 4. Linked instructor.
    if (await this.repo.isInstructorOf(actor.id, studentId)) return;
    // 5. Grading examiner — only meaningful for entityType='grading'.
    if (
      entityType === 'grading' &&
      entityId &&
      (await this.isGradingExaminer(actor.id, entityId))
    ) {
      return;
    }
    throw new ForbiddenException({
      error: { code: 'FORBIDDEN', message: 'Access denied to feedback thread.' },
    });
  }

  /**
   * Convenience overload that pulls the `studentId`/`entityType`/
   * `entityId` triple out of an already-loaded thread row.
   */
  async assertAccessToThread(
    actor: AuthenticatedUser,
    thread: DbFeedbackThread,
  ): Promise<void> {
    await this.assertAccessForKey(
      actor,
      thread.studentId,
      thread.entityType as FeedbackEntityType,
      thread.entityId,
    );
  }

  /**
   * True when the actor either recorded or verified the rank_history
   * row referenced by `rankHistoryId`. Direct DB read (not through
   * a repo method) because rank_history belongs to a sibling module
   * and we don't want a `FeedbackRepository` to depend on it.
   */
  private async isGradingExaminer(
    actorId: string,
    rankHistoryId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({
        recordedByUserId: rankHistory.recordedByUserId,
        verifiedByUserId: rankHistory.verifiedByUserId,
      })
      .from(rankHistory)
      .where(eq(rankHistory.id, rankHistoryId))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    return row.verifiedByUserId === actorId || row.recordedByUserId === actorId;
  }
}
