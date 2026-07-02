import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  GradingRequirements,
  SetGradingRequirementsInput,
} from '@repo/contracts/grading-requirements';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
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
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
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

  /**
   * Unauthenticated variant used by the public-rank projection
   * ({@link BeltRanksService.findPublicBySlug}), which has no
   * `AuthenticatedUser` to hand to `resolveForSet`.
   *
   * Returns `null` when the rank+set scope has no configured requirements
   * (no scalar anchor row) rather than the truthy empty-shell object
   * `fetchForScope` would otherwise return — the public rank page treats
   * `null` as "omit the requirements section" (see the comment on
   * `BeltRanksService.resolvePublicRequirements`).
   */
  async resolveForSetOrNull(
    rankId: string,
    setId: string,
  ): Promise<GradingRequirements | null> {
    const scalar = await this.repo.fetchScalar(rankId, setId);
    if (!scalar) return null;
    return this.fetchForScope(rankId, setId);
  }

  // ── Ancestor-walk resolution ─────────────────────────────────────────────

  async resolveForUser(
    rankId: string,
    targetUserId: string,
    actor: AuthenticatedUser,
  ): Promise<GradingRequirements> {
    // 1. Fetch target's org memberships once — reused for both the auth
    //    check below and the student org walk in step 2 (previously fetched
    //    twice per call; see Task 25 final review finding #3).
    const { data: allMemberships } = await this.memberships.list({ userId: targetUserId });

    // 2. Authorise
    const ability = this.abilityFactory.createForUser(actor);

    if (actor.id !== targetUserId) {
      if (!ability.can('manage', 'all')) {
        const targetOrgIds = allMemberships.map((m) => m.organisationId);

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

    // 3. Resolve student org via the most-recently-updated student membership
    const studentOrg = allMemberships
      .filter((m) => m.role === 'student')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.organisationId ?? null;

    if (!studentOrg) return this.emptyRequirements(rankId, null);

    // 4. Walk ancestors self → root; return on first org with an active set that has this rank
    const ancestors = await this.orgs.getAncestorIds(studentOrg);
    for (const orgId of ancestors) {
      const active = await this.sets.findActiveByOrg(orgId);
      if (!active) continue;
      const scalar = await this.repo.fetchScalar(rankId, active.id);
      if (scalar) return this.fetchForScope(rankId, active.id);
    }

    // 5. Fall back to global default set (organisationId IS NULL)
    const globalActive = await this.sets.findActiveByOrg(null);
    if (globalActive) {
      const scalar = await this.repo.fetchScalar(rankId, globalActive.id);
      if (scalar) return this.fetchForScope(rankId, globalActive.id);
    }

    return this.emptyRequirements(rankId, null);
  }

  // ── Write methods ────────────────────────────────────────────────────────

  async replace(
    rankId: string,
    body: SetGradingRequirementsInput,
    user: AuthenticatedUser,
  ): Promise<GradingRequirements> {
    if (!body.setId) {
      throw new BadRequestException({ error: 'setId is required', code: 'VALIDATION_ERROR' });
    }
    const set = await this.sets.findById(body.setId);
    if (!set) throw new NotFoundException({ error: 'Set not found', code: 'NOT_FOUND' });
    this.assertCanManageSet(user, set.organisationId);

    await this.db.transaction(async (tx) => {
      await this.repo.deleteScope(rankId, body.setId, tx);
      await this.repo.insertScalar(
        {
          rankId,
          setId: body.setId,
          jissenMinutes: body.jissenMinutes ?? null,
          jissenTested: body.jissenTested ?? false,
          minMonthsSincePreviousRank: body.minMonthsSincePreviousRank ?? null,
          requiresTheoricExam: body.requiresTheoricExam ?? false,
          requiresEssay: body.requiresEssay ?? false,
        },
        tx,
      );

      const techRows = [
        ...(body.kihon ?? []).map((id) => ({ rankId, setId: body.setId, techniqueId: id, isTested: false })),
        ...(body.kihonTested ?? []).map((id) => ({ rankId, setId: body.setId, techniqueId: id, isTested: true })),
      ];
      const dedupTech = this.dedupTested(techRows, 'techniqueId');
      if (dedupTech.length) await this.repo.insertTechniques(dedupTech, tx);

      const patternRows = [
        ...(body.kobo ?? []).map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: false })),
        ...(body.koboTested ?? []).map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: true })),
        ...(body.otherPatterns ?? []).map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: false })),
        ...(body.otherPatternsTested ?? []).map((id) => ({ rankId, setId: body.setId, patternId: id, isTested: true })),
      ];
      const dedupPat = this.dedupTested(patternRows, 'patternId');
      if (dedupPat.length) await this.repo.insertPatterns(dedupPat, tx);

      for (const group of body.hokeiGroups ?? []) {
        const clamped = Math.min(group.pickCount, group.patternIds.length);
        const inserted = await this.repo.insertHokeiGroup(
          {
            rankId,
            setId: body.setId,
            groupOrder: group.groupOrder ?? 0,
            pickCount: clamped,
            isTested: group.isTested ?? false,
            labelEn: group.labelEn ?? null,
            labelFi: group.labelFi ?? null,
            labelSv: group.labelSv ?? null,
          },
          tx,
        );
        await this.repo.insertHokeiGroupPatterns(
          group.patternIds.map((pid, i) => ({ groupId: inserted.id, patternId: pid, sortOrder: i })),
          tx,
        );
      }
    });

    return this.fetchForScope(rankId, body.setId);
  }

  async clearForScope(rankId: string, setId: string, user: AuthenticatedUser): Promise<void> {
    const set = await this.sets.findById(setId);
    if (!set) throw new NotFoundException({ error: 'Set not found', code: 'NOT_FOUND' });
    this.assertCanManageSet(user, set.organisationId);
    await this.db.transaction(async (tx) => {
      await this.repo.deleteScope(rankId, setId, tx);
    });
  }

  async deepCopyDetailsForSet(sourceSetId: string, targetSetId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rankIds = await this.repo.distinctRankIdsForSet(sourceSetId, tx);
      for (const rankId of rankIds) {
        const scalar = await this.repo.fetchScalar(rankId, sourceSetId, tx);
        if (!scalar) continue;
        await this.repo.insertScalar(
          {
            rankId,
            setId: targetSetId,
            jissenMinutes: scalar.jissenMinutes,
            jissenTested: scalar.jissenTested,
            minMonthsSincePreviousRank: scalar.minMonthsSincePreviousRank,
            requiresTheoricExam: scalar.requiresTheoricExam,
            requiresEssay: scalar.requiresEssay,
          },
          tx,
        );
        const techniques = await this.repo.fetchTechniques(rankId, sourceSetId, tx);
        if (techniques.length) {
          await this.repo.insertTechniques(
            techniques.map((t) => ({ rankId, setId: targetSetId, techniqueId: t.techniqueId, isTested: t.isTested })),
            tx,
          );
        }
        const patterns = await this.repo.fetchPatternsWithType(rankId, sourceSetId, tx);
        if (patterns.length) {
          await this.repo.insertPatterns(
            patterns.map((p) => ({ rankId, setId: targetSetId, patternId: p.patternId, isTested: p.isTested })),
            tx,
          );
        }
        const groups = await this.repo.fetchHokeiGroups(rankId, sourceSetId, tx);
        for (const g of groups) {
          const inserted = await this.repo.insertHokeiGroup(
            {
              rankId,
              setId: targetSetId,
              groupOrder: g.groupOrder,
              pickCount: g.pickCount,
              isTested: g.isTested,
              labelEn: g.labelEn,
              labelFi: g.labelFi,
              labelSv: g.labelSv,
            },
            tx,
          );
          await this.repo.insertHokeiGroupPatterns(
            g.patternIds.map((pid, i) => ({ groupId: inserted.id, patternId: pid, sortOrder: i })),
            tx,
          );
        }
      }
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private assertCanManageSet(user: AuthenticatedUser, orgId: string | null): void {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: orgId })) {
      throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
  }

  private dedupTested<T extends { isTested: boolean }>(rows: T[], keyField: keyof T): T[] {
    const map = new Map<unknown, T>();
    for (const r of rows) {
      const k = r[keyField];
      const existing = map.get(k);
      if (!existing || r.isTested) map.set(k, r);
    }
    return [...map.values()];
  }
}
