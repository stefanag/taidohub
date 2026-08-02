import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { type AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbUser } from '../../infrastructure/database/schema/index.js';
import { type BeltRanksService } from '../belt-catalog/belt-ranks.service.js';
import { type MembershipsRepository } from '../memberships/memberships.repository.js';
import { type OrganisationsRepository } from '../organisations/organisations.repository.js';
import { type UsersRepository } from '../users/users.repository.js';

import { type StatisticsRepository, type OrgOrPlatformStatsRaw, type UserStatsRaw } from './statistics.repository.js';

import type {
  OrganisationStats,
  PlatformStats,
  RebuildStatsResponse,
  StatsTrendResponse,
  UserStats,
} from '@repo/contracts/statistics';

/**
 * Business logic + authorisation for the statistics feature.
 *
 * Authorisation is a mix of cheap role short-circuits (sysadmin, self) and
 * CASL instance checks via `AbilityFactory.createForUser` — same pattern as
 * `RequirementSetsService.assertCanManage`. Two checks
 * (`assertCanReadOrg`/`assertCanReadUser`) additionally fall back to
 * `OrganisationsRepository.getAncestorIds` for the "descendant org's data
 * rolls up into its ancestors" rule that the (synchronous, DB-free) CASL
 * contributor in `statistics.abilities.ts` cannot express on its own — see
 * that file's doc comment for the full rationale.
 *
 * `UsersRepository` and `MembershipsRepository` are additions beyond the
 * four collaborators the brief anticipated (repo/orgs/ranks/abilityFactory):
 * `getUserStats`/`getUserTrends` need to know which organisations the
 * *target* user (not the caller) belongs to in order to run the
 * instructor/orgadmin instance checks, and the wire contract's
 * `UserStats.scope.name` needs the target's display name. Neither is
 * derivable from `AuthenticatedUser` (which only describes the caller).
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly repo: StatisticsRepository,
    private readonly orgs: OrganisationsRepository,
    private readonly ranks: BeltRanksService,
    private readonly abilityFactory: AbilityFactory,
    private readonly users: UsersRepository,
    private readonly memberships: MembershipsRepository,
  ) {}

  async getPlatformStats(user: AuthenticatedUser): Promise<PlatformStats> {
    if (user.role !== 'sysadmin') {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Platform statistics require sysadmin.' },
      });
    }
    const raw = await this.repo.getPlatform();
    return this.toPlatformApi(raw);
  }

  async getOrganisationStats(orgId: string, user: AuthenticatedUser): Promise<OrganisationStats> {
    await this.assertCanReadOrg(user, orgId);
    const raw = await this.repo.getOrganisation(orgId);
    if (!raw) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Organisation ${orgId} has no statistics.` },
      });
    }
    const org = await this.orgs.findById(orgId);
    return this.toOrgApi(orgId, org?.nameEn ?? '', raw);
  }

  async getOrganisationTrends(
    orgId: string,
    metric: string,
    dimensionKey: string,
    months: number,
    user: AuthenticatedUser,
  ): Promise<StatsTrendResponse> {
    await this.assertCanReadOrg(user, orgId);
    const points = await this.repo.getTrends({ type: 'organisation', id: orgId }, metric, dimensionKey, months);
    return { metric, dimensionKey, points };
  }

  async getUserStats(userId: string, user: AuthenticatedUser): Promise<UserStats> {
    const target = await this.assertCanReadUser(userId, user);
    const raw = await this.repo.getUser(userId);
    return this.toUserApi(userId, target.name, raw);
  }

  async getUserTrends(
    userId: string,
    metric: string,
    dimensionKey: string,
    months: number,
    user: AuthenticatedUser,
  ): Promise<StatsTrendResponse> {
    await this.assertCanReadUser(userId, user);
    const points = await this.repo.getTrends({ type: 'user', id: userId }, metric, dimensionKey, months);
    return { metric, dimensionKey, points };
  }

  async rebuild(user: AuthenticatedUser): Promise<RebuildStatsResponse> {
    if (user.role !== 'sysadmin') {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Rebuilding statistics requires sysadmin.' },
      });
    }
    const { durationMs } = await this.repo.rebuildAll();
    return { ok: true, durationMs };
  }

  // ── Authorisation ────────────────────────────────────────────────────────

  /**
   * sysadmin → always OK.
   * Otherwise: CASL instance check against the caller's own (flat)
   * orgadmin memberships first (no DB round trip for the common "viewing
   * my own org" case); if that fails, fall back to an ancestor-closure
   * walk — an orgadmin of a descendant org can also read an ANCESTOR
   * org's aggregated numbers, because the descendant's own metrics are
   * already rolled up into every ancestor's `stat_current` row (see
   * `StatisticsRepository`/`statistics_org_and_ancestors`).
   */
  private async assertCanReadOrg(user: AuthenticatedUser, orgId: string): Promise<void> {
    if (user.role === 'sysadmin') return;

    const ability = this.abilityFactory.createForUser(user);
    if (ability.can('read', { __caslSubjectType__: 'Statistics', scopeType: 'organisation', scopeId: orgId })) {
      return;
    }

    const orgadminOrgIds = user.memberships.filter((m) => m.role === 'orgadmin').map((m) => m.organisationId);
    for (const adminOrgId of orgadminOrgIds) {
      const ancestors = await this.orgs.getAncestorIds(adminOrgId);
      if (ancestors.includes(orgId)) return;
    }

    throw new ForbiddenException({
      error: { code: 'FORBIDDEN', message: `Cannot read statistics for organisation ${orgId}.` },
    });
  }

  /**
   * sysadmin → always OK. Self → always OK. Otherwise the caller needs
   * either an instructor membership in one of the target user's clubs, or
   * an orgadmin membership in one of the target's clubs OR one of their
   * ancestors ("including subtree" — mirrors `assertCanReadOrg`'s rollup,
   * applied from the target's org outward instead of the caller's).
   *
   * 404s before the ability check if the target user doesn't exist at
   * all, so an unauthorised caller can't distinguish "forbidden" from
   * "doesn't exist" for a user they have zero relationship to — but a
   * caller who legitimately can't read ANY user still gets 404 before
   * 403, same trade-off `UsersService.findOne` doesn't make (it 404s
   * first too, then gates on `read`).
   */
  private async assertCanReadUser(userId: string, user: AuthenticatedUser): Promise<DbUser> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      });
    }
    if (user.role === 'sysadmin' || user.id === userId) return target;

    const ability = this.abilityFactory.createForUser(user);
    const { data: targetMemberships } = await this.memberships.list({ userId });

    for (const m of targetMemberships) {
      if (
        ability.can('read', {
          __caslSubjectType__: 'Statistics',
          scopeType: 'user',
          scopeId: userId,
          organisationId: m.organisationId,
        })
      ) {
        return target;
      }
    }

    const orgadminOrgIds = user.memberships.filter((m) => m.role === 'orgadmin').map((m) => m.organisationId);
    if (orgadminOrgIds.length > 0) {
      for (const m of targetMemberships) {
        const ancestors = await this.orgs.getAncestorIds(m.organisationId);
        if (ancestors.some((id) => orgadminOrgIds.includes(id))) return target;
      }
    }

    throw new ForbiddenException({
      error: { code: 'FORBIDDEN', message: `Cannot read statistics for user ${userId}.` },
    });
  }

  // ── Wire mapping ─────────────────────────────────────────────────────────

  private async toPlatformApi(raw: OrgOrPlatformStatsRaw): Promise<PlatformStats> {
    return {
      scope: { type: 'platform' },
      metrics: raw.metrics,
      ranks: await this.toRankRows(raw.ranks),
      updatedAt: this.resolveUpdatedAt(raw.updatedAt),
    };
  }

  private async toOrgApi(orgId: string, orgName: string, raw: OrgOrPlatformStatsRaw): Promise<OrganisationStats> {
    return {
      scope: { type: 'organisation', id: orgId, name: orgName },
      metrics: raw.metrics,
      ranks: await this.toRankRows(raw.ranks),
      updatedAt: this.resolveUpdatedAt(raw.updatedAt),
    };
  }

  private async toUserApi(userId: string, name: string | null, raw: UserStatsRaw): Promise<UserStats> {
    const allRanks = await this.ranks.list();
    const rankById = new Map(allRanks.map((r) => [r.id, r]));

    const coverageByRank = raw.coverageByRank
      .filter((c) => rankById.has(c.rankId))
      .map((c) => {
        const rank = rankById.get(c.rankId)!;
        return {
          rank: { id: rank.id, nameRomaji: rank.nameRomaji, nameEn: rank.nameEn, sortOrder: rank.sortOrder },
          coveragePct: c.coveragePct,
        };
      })
      .sort((a, b) => a.rank.sortOrder - b.rank.sortOrder);

    return {
      scope: { type: 'user', id: userId, name },
      coverageByRank,
      updatedAt: this.resolveUpdatedAt(raw.updatedAt),
    };
  }

  /**
   * Joins raw `{ rankId, count }` rows against the FULL belt-catalog
   * (`BeltRanksService.list()` — every rank, active or not, so
   * historical membership counts against a since-deprecated rank still
   * render). A catalog rank with no matching raw row gets `count: 0` so
   * the UI can show a complete "0 shodan, 12 kyu-1, ..." breakdown. A raw
   * row for a rank id NOT in the catalog (deleted rank) is silently
   * skipped, since we iterate the catalog, not the raw rows.
   */
  private async toRankRows(
    rawRanks: Array<{ rankId: string; count: number }>,
  ): Promise<PlatformStats['ranks']> {
    const allRanks = await this.ranks.list();
    const countByRankId = new Map(rawRanks.map((r) => [r.rankId, r.count]));

    return allRanks
      .map((rank) => ({
        rank: { id: rank.id, nameRomaji: rank.nameRomaji, nameEn: rank.nameEn, sortOrder: rank.sortOrder },
        count: countByRankId.get(rank.id) ?? 0,
      }))
      .sort((a, b) => a.rank.sortOrder - b.rank.sortOrder);
  }

  /**
   * `StatisticsRepository` returns `new Date(0)` as a "zero rows for this
   * scope" sentinel (see `getOrgOrPlatform`/`getUser`). Surfacing that
   * literally would read as "computed in 1970" on the wire — semantically
   * wrong, since it implies real 1970 data rather than "nothing computed
   * yet". Map the sentinel to "now" instead: "computed at this instant,
   * no data yet".
   */
  private resolveUpdatedAt(rawUpdatedAt: Date): string {
    const resolved = rawUpdatedAt.getTime() === 0 ? new Date() : rawUpdatedAt;
    return resolved.toISOString();
  }
}
