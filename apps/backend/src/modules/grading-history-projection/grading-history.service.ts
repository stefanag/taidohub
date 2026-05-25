import { ForbiddenException, Injectable } from '@nestjs/common';
import type { GradingHistoryRow } from '@repo/contracts/rank-history';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  RankHistoryAuthService,
  type RoleContext,
} from '../rank-history/rank-history.auth.service.js';
import {
  RankHistoryRepository,
  type JoinedRankHistoryRow,
} from '../rank-history/rank-history.repository.js';

/**
 * Unified grading-history projection. Joins `rank_history` with `belt_ranks`
 * (for system+level lookup used by the eventual D3 grading-officer cap) and
 * with `user` (for the verifier's display name), then hydrates examiner /
 * organisationName per-row based on source.
 *
 * Role lookups are batched ONCE per request via `loadRoleContext` — the
 * per-row capability flags reuse that context, keeping the projection
 * O(rows) instead of O(rows × roles).
 *
 * v1 footprint: `source='event'` rows return `examiner=null` and
 * `organisationName=null` because the `grading_events` table (followup D1)
 * does not exist yet. Once D1 lands, the projection's repository can left-join
 * the event tables and the hydration branch fills in.
 */
@Injectable()
export class GradingHistoryService {
  constructor(
    private readonly repo: RankHistoryRepository,
    private readonly auth: RankHistoryAuthService,
  ) {}

  async list(subjectUserId: string, actor: AuthenticatedUser): Promise<GradingHistoryRow[]> {
    const ctx = await this.auth.loadRoleContext(actor, subjectUserId);
    if (!this.auth.canReadWithCtx(actor, ctx)) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Cannot read history for this user.' },
      });
    }
    const rows = await this.repo.listByUserJoined(subjectUserId);
    return rows.map((r) => this.toProjection(r, actor, ctx));
  }

  private toProjection(
    joined: JoinedRankHistoryRow,
    actor: AuthenticatedUser,
    ctx: RoleContext,
  ): GradingHistoryRow {
    const r = joined.row;
    const isExternal = r.source === 'external';
    return {
      id: r.id,
      source: r.source,
      userId: r.userId,
      rankId: r.rankId,
      shogoTitle: r.shogoTitle,
      date: r.date,
      result: r.result,
      notes: r.notes,
      // D1: event-sourced rows have null examiner/org until grading_events lands.
      examiner: isExternal ? r.examinerName : null,
      organisationName: isExternal ? r.organisationName : null,
      verified: r.verified,
      verifiedBy: joined.verifiedBy
        ? { id: joined.verifiedBy.id, name: joined.verifiedBy.name ?? joined.verifiedBy.id }
        : null,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      canVerify: this.auth.canVerifyWithCtx(actor, r, ctx),
      canEdit: this.auth.canEditWithCtx(actor, r, ctx),
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      updatedByUserId: r.updatedByUserId,
    };
  }
}
