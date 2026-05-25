import { Inject, Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { type DbRankHistory } from '../../infrastructure/database/schema/index.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

/**
 * The precomputed role context for one (actor, subjectUser) pair. Loaded
 * once per request and then handed to each per-row predicate so the
 * unified projection stays O(rows) instead of O(rows × roles).
 */
export interface RoleContext {
  isSysadmin: boolean;
  /** Org ids where the actor is the head instructor. */
  headInstructorOf: Set<string>;
  /** Org ids the subject is a member of — used to test head-instructor + org-share intersections. */
  subjectOrgIds: Set<string>;
  /** True when actor and subject share at least one organisation membership. */
  sharesOrgWithSubject: boolean;
  /** Subject user ids the actor is linked to via instructor_students (D2 — empty in v1). */
  instructorLinks: Set<string>;
  /** Per-system rank-level caps the actor holds as a grading officer (D3 — empty in v1). */
  gradingOfficerCaps: Map<string, number>;
  /** Carried so the synchronous predicates know the subject without a re-lookup. */
  subjectUserId: string;
}

/**
 * Service-layer authorisation predicates for rank-history rows.
 *
 * The "WithCtx" variants are synchronous and take a precomputed `RoleContext`
 * loaded by `loadRoleContext`. Spec §6.3 requires the projection to batch all
 * role lookups once per request — `loadRoleContext` is that batch step.
 *
 * v1 fail-closed posture: predicates 3 (linked instructor) and 4 (capped
 * grading officer) from spec §6.3 are not yet wired because their backing
 * tables (`instructor_students`, `grading_officers*`) don't exist. They
 * resolve to `false` here and will activate as the followup tables land.
 */
@Injectable()
export class RankHistoryAuthService {
  constructor(
    private readonly orgs: OrganisationsRepository,
    private readonly memberships: MembershipsRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async loadRoleContext(
    actor: AuthenticatedUser,
    subjectUserId: string,
    tx?: DrizzleExecutor,
  ): Promise<RoleContext> {
    const isSysadmin = actor.role === 'sysadmin';
    const headInstructorOrgIds = await this.orgs.findHeadInstructorOrgIds(actor.id, tx);
    const headInstructorOf = new Set(headInstructorOrgIds);

    // Org-sharing: load both actor's and subject's memberships and intersect.
    const [actorMemberships, subjectMemberships] = await Promise.all([
      this.memberships.list({ userId: actor.id }),
      this.memberships.list({ userId: subjectUserId }),
    ]);
    const actorOrgIds = new Set(actorMemberships.data.map((m) => m.organisationId));
    const subjectOrgIds = new Set(subjectMemberships.data.map((m) => m.organisationId));
    const sharesOrgWithSubject = [...subjectOrgIds].some((o) => actorOrgIds.has(o));

    return {
      isSysadmin,
      headInstructorOf,
      subjectOrgIds,
      sharesOrgWithSubject,
      // D2 — `instructor_students` does not exist yet; predicate fails closed.
      instructorLinks: new Set<string>(),
      // D3 — `grading_officers*` does not exist yet; predicate fails closed.
      gradingOfficerCaps: new Map<string, number>(),
      subjectUserId,
    };
  }

  // ---------- async convenience wrappers (load + apply) ----------

  async canRead(
    actor: AuthenticatedUser,
    subjectUserId: string,
    tx?: DrizzleExecutor,
  ): Promise<boolean> {
    if (actor.id === subjectUserId) return true;
    if (actor.role === 'sysadmin') return true;
    const ctx = await this.loadRoleContext(actor, subjectUserId, tx);
    return this.canReadWithCtx(actor, ctx);
  }

  async canVerify(
    actor: AuthenticatedUser,
    row: DbRankHistory,
    tx?: DrizzleExecutor,
  ): Promise<boolean> {
    const ctx = await this.loadRoleContext(actor, row.userId, tx);
    return this.canVerifyWithCtx(actor, row, ctx);
  }

  canEdit(actor: AuthenticatedUser, row: DbRankHistory): boolean {
    if (row.source === 'event') return false;
    if (actor.role === 'sysadmin') return true;
    if (actor.id === row.recordedByUserId) return true;
    if (actor.id === row.userId) return true;
    return false;
  }

  canDelete(actor: AuthenticatedUser, row: DbRankHistory): boolean {
    // Same logic as canEdit per spec §6.3.
    return this.canEdit(actor, row);
  }

  // ---------- synchronous predicates (use precomputed ctx) ----------

  canReadWithCtx(actor: AuthenticatedUser, ctx: RoleContext): boolean {
    if (actor.id === ctx.subjectUserId) return true;
    if (ctx.isSysadmin) return true;
    if (ctx.sharesOrgWithSubject) return true;
    return false;
  }

  canEditWithCtx(
    actor: AuthenticatedUser,
    row: DbRankHistory,
    _ctx: RoleContext,
  ): boolean {
    return this.canEdit(actor, row);
  }

  canVerifyWithCtx(
    actor: AuthenticatedUser,
    row: DbRankHistory,
    ctx: RoleContext,
  ): boolean {
    if (row.source === 'event') return false;
    if (actor.id === row.recordedByUserId) return false;

    if (ctx.isSysadmin) return true;

    // Head instructor of one of the subject's orgs — intersect the two sets.
    for (const orgId of ctx.headInstructorOf) {
      if (ctx.subjectOrgIds.has(orgId)) return true;
    }

    // D2 — linked-instructor: ctx.instructorLinks always empty in v1.
    if (ctx.instructorLinks.has(row.userId)) return true;

    // D3 — capped grading officer: ctx.gradingOfficerCaps always empty in v1.
    // When D3 lands, the row's rank.system_id and rank.level inform the check.

    return false;
  }
}
