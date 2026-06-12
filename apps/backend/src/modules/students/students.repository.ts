import { Inject, Injectable } from '@nestjs/common';
import { PROGRESS_STATUSES } from '@repo/contracts/progress';
import type { StudentRosterRow } from '@repo/contracts/students';
import { eq, inArray, sql } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
} from '../../infrastructure/database/client.js';
import { organisationMembership } from '../../infrastructure/database/schema/memberships.js';
import { organisations } from '../../infrastructure/database/schema/organisations.js';
import { userContentProgress } from '../../infrastructure/database/schema/user-content-progress.js';
import { user } from '../../infrastructure/database/schema/users.js';

type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

interface RosterQueryRow {
  userId: string;
  name: string | null;
  email: string;
  organisations: { id: string; name: string }[];
  progressSummary: Record<ProgressStatus, number>;
}

/**
 * Repository — single source of Drizzle access for the students module
 * (instructor view).
 *
 * The roster hydration query joins `user → organisation_membership →
 * organisations` and LEFT-JOINs `user_content_progress` so we can count
 * progress rows per status without an extra round-trip. The org list is
 * folded into a `json_agg(json_build_object(...))` so each user collapses
 * into a single row. The four `COUNT(*) FILTER (WHERE ...)` aggregates
 * compute the per-status counts in the same scan.
 */
@Injectable()
export class StudentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Distinct user ids that are members of any of the given organisation ids. */
  async listStudentIdsInOrgs(
    orgIds: readonly string[],
    excludeUserId?: string,
  ): Promise<string[]> {
    if (orgIds.length === 0) return [];

    const rows = await this.db
      .selectDistinct({ userId: organisationMembership.userId })
      .from(organisationMembership)
      .where(inArray(organisationMembership.organisationId, [...orgIds]));

    const ids = rows.map((r) => r.userId);
    return excludeUserId ? ids.filter((id) => id !== excludeUserId) : ids;
  }

  /** Roster rows for the given user ids. */
  async listRosterByUserIds(
    userIds: readonly string[],
  ): Promise<StudentRosterRow[]> {
    if (userIds.length === 0) return [];
    const rows = await this.runRosterQuery(
      sql`${user.id} IN (${sql.join(
        userIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    return rows.map((r) => this.toApi(r));
  }

  /** Sysadmin path: roster of every user with at least one membership. */
  async listAllRoster(): Promise<StudentRosterRow[]> {
    const rows = await this.runRosterQuery(null);
    return rows.map((r) => this.toApi(r));
  }

  /** Org ids the student is a member of. Used by the `Student` CASL subject. */
  async listOrgIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ organisationId: organisationMembership.organisationId })
      .from(organisationMembership)
      .where(eq(organisationMembership.userId, userId));
    return rows.map((r) => r.organisationId);
  }

  // ── Internals ────────────────────────────────────────────────────────
  /**
   * Run the roster hydration query, optionally filtered by an extra SQL
   * predicate (`user.id IN (...)` for the instructor path). For the sysadmin
   * path we still INNER-join `organisation_membership` so we only return
   * users that have at least one membership — matching spec §7.2.
   */
  private async runRosterQuery(
    extraWhere: ReturnType<typeof sql> | null,
  ): Promise<RosterQueryRow[]> {
    const rows = await this.db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        organisations: sql<{ id: string; name: string }[]>`
          COALESCE(
            json_agg(DISTINCT jsonb_build_object('id', ${organisations.id}, 'name', ${organisations.nameEn}))
              FILTER (WHERE ${organisations.id} IS NOT NULL),
            '[]'::json
          )
        `,
        notStarted: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userContentProgress.status} = 'not_started'), 0)`,
        learning: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userContentProgress.status} = 'learning'), 0)`,
        competent: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userContentProgress.status} = 'competent'), 0)`,
        gradingReady: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userContentProgress.status} = 'grading_ready'), 0)`,
      })
      .from(user)
      .innerJoin(
        organisationMembership,
        eq(organisationMembership.userId, user.id),
      )
      .innerJoin(
        organisations,
        eq(organisations.id, organisationMembership.organisationId),
      )
      .leftJoin(
        userContentProgress,
        eq(userContentProgress.userId, user.id),
      )
      .where(extraWhere ?? sql`TRUE`)
      .groupBy(user.id, user.name, user.email);

    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      organisations: r.organisations ?? [],
      progressSummary: {
        not_started: Number(r.notStarted) || 0,
        learning: Number(r.learning) || 0,
        competent: Number(r.competent) || 0,
        grading_ready: Number(r.gradingReady) || 0,
      },
    }));
  }

  private toApi(row: RosterQueryRow): StudentRosterRow {
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      organisations: row.organisations,
      progressSummary: row.progressSummary,
    };
  }
}
