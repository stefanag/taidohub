import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCodes } from '@repo/contracts/errors';
import {
  ageForGrading,
  ageGroupContains,
  ageGroupsOverlap,
  DEFAULT_GRADING_AGE_BASIS,
  type GradingAgeBasis,
} from '@repo/contracts/grading-age';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';
import { ProfileService } from '../profile/profile.service.js';

import { type HokeiGroupWithPatternsRow, RankRequirementsRepository } from './rank-requirements.repository.js';
import { RequirementSetsRepository } from './requirement-sets.repository.js';


import type { DrizzleExecutor } from '../../infrastructure/database/client.js';
import type {
  AgeGroup,
  GradingRequirements,
  SetAgeGroupsInput,
  SetGradingRequirementsInput,
} from '@repo/contracts/grading-requirements';

/** Belt systems whose ranks may have age-based variants (not the children's `mon`). */
const AGE_GROUP_SYSTEMS = new Set(['kyu', 'dan']);

/** Where a student's requirement for a rank comes from, before loading its details. */
export interface ResolvedRequirementScope {
  setId: string | null;
  setName: string | null;
  ageGroup: AgeGroup | null;
  ageGroups: AgeGroup[];
  ageBasis: GradingAgeBasis;
  ageUnknown: boolean;
}

type RequirementBody = Omit<SetGradingRequirementsInput, 'setId' | 'ageGroupId'>;

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
    private readonly profiles: ProfileService,
  ) {}

  // ── Pure helper ──────────────────────────────────────────────────────────

  emptyRequirements(
    rankId: string,
    setId: string | null,
    extras: Partial<Pick<GradingRequirements, 'ageGroup' | 'ageGroups' | 'ageBasis' | 'ageUnknown'>> = {},
  ): GradingRequirements {
    return {
      rankId,
      setId,
      ageGroup: extras.ageGroup ?? null,
      ageGroups: extras.ageGroups ?? [],
      ageBasis: extras.ageBasis ?? DEFAULT_GRADING_AGE_BASIS,
      ageUnknown: extras.ageUnknown ?? false,
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

  /**
   * The requirement of one scope: the base (`ageGroupId = null`) or one age
   * group's variant. `ageUnknown` is passed through from the resolution.
   */
  async fetchForScope(
    rankId: string,
    setId: string | null,
    ageGroupId: string | null = null,
    ageUnknown = false,
  ): Promise<GradingRequirements> {
    const [ageGroups, ageBasis] = await Promise.all([
      this.ageGroupsFor(rankId, setId),
      this.ageBasisForSet(setId),
    ]);
    const ageGroup = ageGroupId ? (ageGroups.find((g) => g.id === ageGroupId) ?? null) : null;
    if (ageGroupId && !ageGroup) {
      throw new NotFoundException({
        error: { code: ErrorCodes.NOT_FOUND, message: 'Age group not found for this rank and set' },
      });
    }
    const extras = { ageGroup, ageGroups, ageBasis, ageUnknown };
    const scalar = await this.repo.fetchScalar(rankId, setId, undefined, ageGroupId);
    if (!scalar) return this.emptyRequirements(rankId, setId, extras);

    const [techniques, patterns, groups] = await Promise.all([
      this.repo.fetchTechniques(rankId, setId, undefined, ageGroupId),
      this.repo.fetchPatternsWithType(rankId, setId, undefined, ageGroupId),
      this.repo.fetchHokeiGroups(rankId, setId, undefined, ageGroupId),
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
      ...extras,
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
    ageGroupId: string | null = null,
  ): Promise<GradingRequirements> {
    void user; // Every authenticated user is allowed to read RequirementSet (Task 7 ability rule)
    const set = await this.sets.findById(setId);
    if (!set) {
      throw new NotFoundException({
        error: { code: ErrorCodes.NOT_FOUND, message: 'Requirement set not found' },
      });
    }
    return this.fetchForScope(rankId, setId, ageGroupId);
  }

  /**
   * Every age group's variant of a rank in a set, for the public rank page
   * (which has no student to pick one for). Empty when it has none.
   */
  async ageVariantsForSet(rankId: string, setId: string): Promise<GradingRequirements[]> {
    const groups = await this.repo.listAgeGroups(rankId, setId);
    return Promise.all(groups.map((g) => this.fetchForScope(rankId, setId, g.id)));
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
    options: { gradingDate?: string } = {},
  ): Promise<GradingRequirements> {
    // 1. Fetch target's org memberships once — reused for both the auth
    //    check below and the student org walk in step 2 (previously fetched
    //    twice per call; see Task 25 final review finding #3).
    const { data: allMemberships } = await this.memberships.list({ userId: targetUserId });

    // 2. Authorise
    const ability = this.abilityFactory.createForUser(actor);

    if (actor.id !== targetUserId) {
      if (actor.role !== 'sysadmin') {
        const targetOrgIds = allMemberships.map((m) => m.organisationId);

        if (
          !ability.can('read', {
            __caslSubjectType__: 'Student',
            organisationIds: targetOrgIds,
          })
        ) {
          throw new ForbiddenException({
            error: { code: ErrorCodes.FORBIDDEN, message: 'Forbidden' },
          });
        }
      }
    }

    const scope = await this.locateForUser(rankId, targetUserId, options.gradingDate, allMemberships);
    if (!scope) return this.emptyRequirements(rankId, null);
    return this.fetchForScope(rankId, scope.setId, scope.ageGroup?.id ?? null, scope.ageUnknown);
  }

  /**
   * Which set and age group apply to a student for a rank on a date (today by
   * default), without authorization or loading the details. Null when no set
   * has the rank. Used for the snapshot on a verified grading as well.
   *
   * 1. The set: walk the student's organisation (latest student membership,
   *    else the reference federation) up to the first active set with a base
   *    requirement for the rank; else the global set.
   * 2. The age basis: from the nearest national federation of the set's
   *    organisation.
   * 3. The variant: the age group containing the student's age on the date;
   *    none (base) without groups, without a match, or without a date of birth.
   */
  async locateForUser(
    rankId: string,
    userId: string,
    gradingDate?: string,
    memberships?: { organisationId: string; role: string; updatedAt: Date }[],
  ): Promise<ResolvedRequirementScope | null> {
    const allMemberships = memberships ?? (await this.memberships.list({ userId })).data;
    const studentOrg =
      allMemberships
        .filter((m) => m.role === 'student')
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.organisationId ??
      (await this.profiles.getReferenceFederationId(userId));

    let set: { id: string; name: string } | null = null;
    const ancestors = studentOrg ? await this.orgs.getAncestorIds(studentOrg) : [];
    for (const orgId of ancestors) {
      const active = await this.sets.findActiveByOrg(orgId);
      if (active && (await this.repo.fetchScalar(rankId, active.id))) {
        set = active;
        break;
      }
    }
    if (!set) {
      const globalActive = await this.sets.findActiveByOrg(null);
      if (globalActive && (await this.repo.fetchScalar(rankId, globalActive.id))) set = globalActive;
    }
    if (!set) return null;

    const [ageGroups, ageBasis, dateOfBirth] = await Promise.all([
      this.ageGroupsFor(rankId, set.id),
      this.ageBasisForSet(set.id),
      this.profiles.getDateOfBirth(userId),
    ]);
    let ageGroup: AgeGroup | null = null;
    if (ageGroups.length > 0 && dateOfBirth) {
      const today = new Date().toISOString().slice(0, 10);
      const age = ageForGrading(dateOfBirth, gradingDate ?? today, ageBasis);
      ageGroup = ageGroups.find((g) => ageGroupContains(g, age)) ?? null;
    }
    return {
      setId: set.id,
      setName: set.name,
      ageGroup,
      ageGroups,
      ageBasis,
      ageUnknown: ageGroups.length > 0 && !dateOfBirth,
    };
  }

  /** How age is counted for a set: its nearest national federation's setting. */
  async ageBasisForSet(setId: string | null): Promise<GradingAgeBasis> {
    if (!setId) return DEFAULT_GRADING_AGE_BASIS;
    const set = await this.sets.findById(setId);
    if (!set?.organisationId) return DEFAULT_GRADING_AGE_BASIS;
    for (const orgId of await this.orgs.getAncestorIds(set.organisationId)) {
      const org = await this.orgs.findById(orgId);
      if (org?.type === 'national_federation') return org.gradingAgeBasis ?? DEFAULT_GRADING_AGE_BASIS;
    }
    return DEFAULT_GRADING_AGE_BASIS;
  }

  private async ageGroupsFor(rankId: string, setId: string | null): Promise<AgeGroup[]> {
    const rows = await this.repo.listAgeGroups(rankId, setId);
    return rows.map((g) => ({ id: g.id, ageFrom: g.ageFrom, ageTo: g.ageTo }));
  }

  // ── Write methods ────────────────────────────────────────────────────────

  async replace(
    rankId: string,
    body: SetGradingRequirementsInput,
    user: AuthenticatedUser,
  ): Promise<GradingRequirements> {
    if (!body.setId) {
      throw new BadRequestException({
        error: { code: ErrorCodes.VALIDATION_FAILED, message: 'setId is required' },
      });
    }
    const set = await this.sets.findById(body.setId);
    if (!set) {
      throw new NotFoundException({
        error: { code: ErrorCodes.NOT_FOUND, message: 'Set not found' },
      });
    }
    this.assertCanManageSet(user, set.organisationId);
    const ageGroupId = body.ageGroupId ?? null;
    if (ageGroupId) {
      const groups = await this.repo.listAgeGroups(rankId, body.setId);
      if (!groups.some((g) => g.id === ageGroupId)) {
        throw new NotFoundException({
          error: { code: ErrorCodes.NOT_FOUND, message: 'Age group not found for this rank and set' },
        });
      }
    }

    await this.db.transaction(async (tx) => {
      await this.repo.deleteScope(rankId, body.setId, tx, ageGroupId);
      await this.writeScope(rankId, body.setId, ageGroupId, body, tx);
    });

    return this.fetchForScope(rankId, body.setId, ageGroupId);
  }

  /**
   * Whole-list replace of a kyu or dan rank's age groups in a set. A kept
   * group (by id) keeps its variant; a new group gets a copy of the base
   * requirement as its variant; a group left out is deleted with its variant.
   */
  async setAgeGroups(rankId: string, body: SetAgeGroupsInput, user: AuthenticatedUser): Promise<GradingRequirements> {
    const set = await this.sets.findById(body.setId);
    if (!set) {
      throw new NotFoundException({ error: { code: ErrorCodes.NOT_FOUND, message: 'Set not found' } });
    }
    this.assertCanManageSet(user, set.organisationId);
    const system = await this.repo.rankSystemCode(rankId);
    if (!system || !AGE_GROUP_SYSTEMS.has(system)) {
      throw new BadRequestException({
        error: { code: 'AGE_GROUPS_NOT_ALLOWED', message: 'Only kyu and dan ranks can have age groups.' },
      });
    }
    for (let i = 0; i < body.groups.length; i++) {
      for (let j = i + 1; j < body.groups.length; j++) {
        if (ageGroupsOverlap(body.groups[i]!, body.groups[j]!)) {
          throw new BadRequestException({
            error: { code: 'AGE_GROUPS_OVERLAP', message: 'Age groups must not overlap.' },
          });
        }
      }
    }
    const base = await this.fetchForScope(rankId, body.setId);
    if (body.groups.length > 0 && !(await this.repo.fetchScalar(rankId, body.setId))) {
      throw new BadRequestException({
        error: { code: 'BASE_REQUIREMENT_REQUIRED', message: 'Save the requirement for all ages first.' },
      });
    }

    await this.db.transaction(async (tx) => {
      const existing = await this.repo.listAgeGroups(rankId, body.setId, tx);
      const existingIds = new Set(existing.map((g) => g.id));
      for (const g of body.groups) {
        if (g.id && !existingIds.has(g.id)) {
          throw new BadRequestException({
            error: { code: ErrorCodes.VALIDATION_FAILED, message: 'Unknown age group id for this rank and set.' },
          });
        }
      }
      const keep = new Set(body.groups.flatMap((g) => (g.id ? [g.id] : [])));
      await this.repo.deleteAgeGroups(
        existing.filter((g) => !keep.has(g.id)).map((g) => g.id),
        tx,
      );
      for (const g of body.groups) {
        if (g.id) {
          await this.repo.updateAgeGroup(g.id, { ageFrom: g.ageFrom, ageTo: g.ageTo }, tx);
        } else {
          const created = await this.repo.insertAgeGroup(
            { rankId, setId: body.setId, ageFrom: g.ageFrom, ageTo: g.ageTo },
            tx,
          );
          await this.writeScope(rankId, body.setId, created.id, this.toBody(base), tx);
        }
      }
    });

    return this.fetchForScope(rankId, body.setId);
  }

  /** Inserts one scope's rows (the scope must be empty). */
  private async writeScope(
    rankId: string,
    setId: string,
    ageGroupId: string | null,
    body: RequirementBody,
    tx: DrizzleExecutor,
  ): Promise<void> {
    const scope = { rankId, setId, ageGroupId };
    await this.repo.insertScalar(
      {
        ...scope,
        jissenMinutes: body.jissenMinutes ?? null,
        jissenTested: body.jissenTested ?? false,
        minMonthsSincePreviousRank: body.minMonthsSincePreviousRank ?? null,
        requiresTheoricExam: body.requiresTheoricExam ?? false,
        requiresEssay: body.requiresEssay ?? false,
      },
      tx,
    );

    const techRows = [
      ...(body.kihon ?? []).map((id) => ({ ...scope, techniqueId: id, isTested: false })),
      ...(body.kihonTested ?? []).map((id) => ({ ...scope, techniqueId: id, isTested: true })),
    ];
    const dedupTech = this.dedupTested(techRows, 'techniqueId');
    if (dedupTech.length) await this.repo.insertTechniques(dedupTech, tx);

    const patternRows = [
      ...(body.kobo ?? []).map((id) => ({ ...scope, patternId: id, isTested: false })),
      ...(body.koboTested ?? []).map((id) => ({ ...scope, patternId: id, isTested: true })),
      ...(body.otherPatterns ?? []).map((id) => ({ ...scope, patternId: id, isTested: false })),
      ...(body.otherPatternsTested ?? []).map((id) => ({ ...scope, patternId: id, isTested: true })),
    ];
    const dedupPat = this.dedupTested(patternRows, 'patternId');
    if (dedupPat.length) await this.repo.insertPatterns(dedupPat, tx);

    for (const group of body.hokeiGroups ?? []) {
      const clamped = Math.min(group.pickCount, group.patternIds.length);
      const inserted = await this.repo.insertHokeiGroup(
        {
          ...scope,
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
  }

  /** A projected requirement turned back into a write body (for copying). */
  private toBody(r: GradingRequirements): RequirementBody {
    return {
      kihon: r.kihon,
      kihonTested: r.kihonTested,
      kobo: r.kobo,
      koboTested: r.koboTested,
      otherPatterns: r.otherPatterns,
      otherPatternsTested: r.otherPatternsTested,
      hokeiGroups: r.hokeiGroups.map((g) => ({
        groupOrder: g.groupOrder,
        pickCount: g.pickCount,
        isTested: g.isTested,
        labelEn: g.labelEn ?? null,
        labelFi: g.labelFi ?? null,
        labelSv: g.labelSv ?? null,
        patternIds: g.patternIds,
      })),
      jissenMinutes: r.jissenMinutes,
      jissenTested: r.jissenTested,
      minMonthsSincePreviousRank: r.minMonthsSincePreviousRank,
      requiresTheoricExam: r.requiresTheoricExam,
      requiresEssay: r.requiresEssay,
    };
  }


  async clearForScope(rankId: string, setId: string, user: AuthenticatedUser): Promise<void> {
    const set = await this.sets.findById(setId);
    if (!set) {
      throw new NotFoundException({
        error: { code: ErrorCodes.NOT_FOUND, message: 'Set not found' },
      });
    }
    this.assertCanManageSet(user, set.organisationId);
    await this.db.transaction(async (tx) => {
      await this.repo.deleteRankFromSet(rankId, setId, tx);
    });
  }

  /** Copies every rank's base requirement, age groups and variants from one set to another. */
  async deepCopyDetailsForSet(sourceSetId: string, targetSetId: string): Promise<void> {
    const rankIds = await this.repo.distinctRankIdsForSet(sourceSetId);
    const copies: { rankId: string; groups: { ageFrom: number | null; ageTo: number | null; body: RequirementBody }[]; base: RequirementBody }[] = [];
    for (const rankId of rankIds) {
      if (!(await this.repo.fetchScalar(rankId, sourceSetId))) continue;
      const base = await this.fetchForScope(rankId, sourceSetId);
      const groups = await this.repo.listAgeGroups(rankId, sourceSetId);
      copies.push({
        rankId,
        base: this.toBody(base),
        groups: await Promise.all(
          groups.map(async (g) => ({
            ageFrom: g.ageFrom,
            ageTo: g.ageTo,
            body: this.toBody(await this.fetchForScope(rankId, sourceSetId, g.id)),
          })),
        ),
      });
    }
    await this.db.transaction(async (tx) => {
      for (const c of copies) {
        await this.writeScope(c.rankId, targetSetId, null, c.base, tx);
        for (const g of c.groups) {
          const created = await this.repo.insertAgeGroup(
            { rankId: c.rankId, setId: targetSetId, ageFrom: g.ageFrom, ageTo: g.ageTo },
            tx,
          );
          await this.writeScope(c.rankId, targetSetId, created.id, g.body, tx);
        }
      }
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private assertCanManageSet(user: AuthenticatedUser, orgId: string | null): void {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: orgId })) {
      throw new ForbiddenException({
        error: { code: ErrorCodes.FORBIDDEN, message: 'Forbidden' },
      });
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
