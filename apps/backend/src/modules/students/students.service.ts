import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ContentType,
  Progress,
  UpsertInstructorProgressInput,
} from '@repo/contracts/progress';
import type { StudentRosterRow } from '@repo/contracts/students';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { ProgressRepository } from '../progress/progress.repository.js';
import { ProgressService } from '../progress/progress.service.js';

import { StudentsRepository } from './students.repository.js';

/**
 * Business logic for the instructor's view of students.
 *
 * Authorisation model:
 *  - The `Student` CASL subject carries `organisationIds` (the student's
 *    membership orgs). An instructor's rule matches when the student's org
 *    set overlaps the instructor's instructor-org set.
 *  - `listRoster` filters at the SQL layer (the `Student` CASL rule is
 *    belt-and-braces for instance-level checks on the other endpoints).
 *  - `getStudentProgress` / `upsertStudentProgress` / `deleteStudentProgress`
 *    each run an instance-level `manage Student` check via
 *    {@link assertCanManageStudent} BEFORE delegating to ProgressService.
 *  - The delegated mutation methods (`upsertOnBehalfOf` / `deleteOnBehalfOf`)
 *    do NOT re-check CASL — they trust this service for row-level auth.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly repo: StudentsRepository,
    private readonly progress: ProgressService,
    private readonly progressRepo: ProgressRepository,
    private readonly abilities: AbilityFactory,
  ) {}

  // ── Roster ──────────────────────────────────────────────────────────
  async listRoster(actor: AuthenticatedUser): Promise<StudentRosterRow[]> {
    if (actor.role === 'sysadmin') {
      return this.repo.listAllRoster();
    }

    const instructorOrgs = actor.memberships
      .filter((m) => m.role === 'instructor')
      .map((m) => m.organisationId);

    if (instructorOrgs.length === 0) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Not an instructor in any organisation.',
        },
      });
    }

    const userIds = await this.repo.listStudentIdsInOrgs(
      instructorOrgs,
      actor.id,
    );
    return this.repo.listRosterByUserIds(userIds);
  }

  // ── Per-student progress ────────────────────────────────────────────
  async getStudentProgress(
    actor: AuthenticatedUser,
    studentUserId: string,
  ): Promise<Progress[]> {
    await this.assertCanManageStudent(actor, studentUserId);
    const rows = await this.progressRepo.listByUser(studentUserId);
    return rows.map((r) => this.progress.toApi(r));
  }

  async upsertStudentProgress(
    actor: AuthenticatedUser,
    studentUserId: string,
    contentType: ContentType,
    contentId: string,
    input: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    await this.assertCanManageStudent(actor, studentUserId);
    return this.progress.upsertOnBehalfOf(
      actor,
      studentUserId,
      contentType,
      contentId,
      input,
    );
  }

  async deleteStudentProgress(
    actor: AuthenticatedUser,
    studentUserId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    await this.assertCanManageStudent(actor, studentUserId);
    await this.progress.deleteOnBehalfOf(
      actor,
      studentUserId,
      contentType,
      contentId,
    );
  }

  // ── Internals ────────────────────────────────────────────────────────
  /**
   * Row-level write check. Builds a synthetic `Student` subject with the
   * target student's membership-org list and asks CASL whether the actor
   * can `manage` it. The instructor rule matches when the student's org
   * set overlaps the instructor's instructor-org set; sysadmin's
   * unconditional rule always passes.
   */
  private async assertCanManageStudent(
    actor: AuthenticatedUser,
    studentUserId: string,
  ): Promise<void> {
    const ability = this.abilities.createForUser(actor);
    const orgIds = await this.repo.listOrgIdsForUser(studentUserId);
    const instance = {
      __caslSubjectType__: 'Student' as const,
      organisationIds: orgIds,
    };
    if (ability.cannot('manage', instance)) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this student.',
        },
      });
    }
  }
}
