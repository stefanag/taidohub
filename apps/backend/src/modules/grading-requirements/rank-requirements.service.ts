import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { GradingRequirements } from '@repo/contracts/grading-requirements';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import { type HokeiGroupWithPatternsRow, RankRequirementsRepository } from './rank-requirements.repository.js';
import { RequirementSetsRepository } from './requirement-sets.repository.js';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RankRequirementsService {
  constructor(
    private readonly repo: RankRequirementsRepository,
    private readonly sets: RequirementSetsRepository,
    private readonly orgs: OrganisationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  // ── Pure helper ──────────────────────────────────────────────────────────

  emptyRequirements(rankId: string, setId: string | null): GradingRequirements {
    return {
      rankId,
      setId,
      kihon: [],
      kihonTested: [],
      kobo: [],
      koboTested: [],
      otherPatterns: [],
      otherPatternsTested: [],
      hokeiGroups: [],
      jissenMinutes: null,
      jissenTested: false,
      minMonthsSincePreviousRank: null,
      requiresTheoricExam: false,
      requiresEssay: false,
    };
  }

  // ── Internal projection ──────────────────────────────────────────────────

  async fetchForScope(
    rankId: string,
    setId: string | null,
  ): Promise<GradingRequirements> {
    const scalar = await this.repo.fetchScalar(rankId, setId);
    if (!scalar) return this.emptyRequirements(rankId, setId);

    const [techniques, patterns, groups] = await Promise.all([
      this.repo.fetchTechniques(rankId, setId),
      this.repo.fetchPatternsWithType(rankId, setId),
      this.repo.fetchHokeiGroups(rankId, setId),
    ]);

    const kihon: string[] = [];
    const kihonTested: string[] = [];
    for (const t of techniques) {
      kihon.push(t.techniqueId);
      if (t.isTested) kihonTested.push(t.techniqueId);
    }

    const kobo: string[] = [];
    const koboTested: string[] = [];
    const otherPatterns: string[] = [];
    const otherPatternsTested: string[] = [];
    for (const p of patterns) {
      if (p.isKobo) {
        kobo.push(p.patternId);
        if (p.isTested) koboTested.push(p.patternId);
      } else {
        otherPatterns.push(p.patternId);
        if (p.isTested) otherPatternsTested.push(p.patternId);
      }
    }

    return {
      rankId,
      setId,
      kihon,
      kihonTested,
      kobo,
      koboTested,
      otherPatterns,
      otherPatternsTested,
      hokeiGroups: groups.map((g: HokeiGroupWithPatternsRow) => ({
        id: g.id,
        groupOrder: g.groupOrder,
        pickCount: g.pickCount,
        isTested: g.isTested,
        labelEn: g.labelEn,
        labelFi: g.labelFi,
        labelSv: g.labelSv,
        patternIds: g.patternIds,
      })),
      jissenMinutes: scalar.jissenMinutes,
      jissenTested: scalar.jissenTested,
      minMonthsSincePreviousRank: scalar.minMonthsSincePreviousRank,
      requiresTheoricExam: scalar.requiresTheoricExam,
      requiresEssay: scalar.requiresEssay,
    };
  }

  // ── Auth-checked passthrough to fetchForScope ────────────────────────────

  async resolveForSet(
    rankId: string,
    setId: string,
    user: AuthenticatedUser,
  ): Promise<GradingRequirements> {
    void user; // Every authenticated user is allowed to read RequirementSet (Task 7 ability rule)
    const set = await this.sets.findById(setId);
    if (!set) {
      throw new NotFoundException({ error: 'Requirement set not found', code: 'NOT_FOUND' });
    }
    return this.fetchForScope(rankId, setId);
  }

  // ── Ancestor-walk resolution ─────────────────────────────────────────────

  async resolveForUser(
    rankId: string,
    targetUserId: string,
    actor: AuthenticatedUser,
  ): Promise<GradingRequirements> {
    // 1. Authorise
    const ability = this.abilityFactory.createForUser(actor);

    if (actor.id !== targetUserId) {
      if (!ability.can('manage', 'all')) {
        // Fetch target's org memberships to build the CASL subject
        const { data: targetMemberships } = await this.memberships.list({ userId: targetUserId });
        const targetOrgIds = targetMemberships.map((m) => m.organisationId);

        if (
          !ability.can('read', {
            __caslSubjectType__: 'Student',
            organisationIds: targetOrgIds,
          })
        ) {
          throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
        }
      }
    }

    // 2. Resolve student org via the most-recently-updated student membership
    const { data: allMemberships } = await this.memberships.list({ userId: targetUserId });
    const studentOrg = allMemberships
      .filter((m) => m.role === 'student')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.organisationId ?? null;

    if (!studentOrg) return this.emptyRequirements(rankId, null);

    // 3. Walk ancestors self → root; return on first org with an active set that has this rank
    const ancestors = await this.orgs.getAncestorIds(studentOrg);
    for (const orgId of ancestors) {
      const active = await this.sets.findActiveByOrg(orgId);
      if (!active) continue;
      const scalar = await this.repo.fetchScalar(rankId, active.id);
      if (scalar) return this.fetchForScope(rankId, active.id);
    }

    // 4. Fall back to global default set (organisationId IS NULL)
    const globalActive = await this.sets.findActiveByOrg(null);
    if (globalActive) {
      const scalar = await this.repo.fetchScalar(rankId, globalActive.id);
      if (scalar) return this.fetchForScope(rankId, globalActive.id);
    }

    return this.emptyRequirements(rankId, null);
  }
}
