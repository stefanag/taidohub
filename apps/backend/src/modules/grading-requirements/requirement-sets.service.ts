import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CloneRequirementSetInput,
  CreateRequirementSetInput,
  RequirementSet,
  UpdateRequirementSetInput,
} from '@repo/contracts/grading-requirements';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import {
  RequirementSetsRepository,
  type RequirementSetRow,
} from './requirement-sets.repository.js';

// ── Row → API mapper ─────────────────────────────────────────────────────

function mapRow(row: RequirementSetRow): RequirementSet {
  return {
    id: row.id,
    name: row.name,
    organisationId: row.organisationId,
    effectiveDate: row.effectiveDate,
    isActive: row.isActive,
    clonedFromId: row.clonedFromId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRows(rows: RequirementSetRow[]): RequirementSet[] {
  return rows.map(mapRow);
}

// ── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class RequirementSetsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly repo: RequirementSetsRepository,
    private readonly orgs: OrganisationsRepository,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async list(user: AuthenticatedUser): Promise<RequirementSet[]> {
    const ability = this.abilityFactory.createForUser(user);
    if (ability.can('manage', 'all')) {
      return mapRows(await this.repo.list('all'));
    }
    const orgIds = user.memberships.map((m) => m.organisationId);
    const ancestorSets = await Promise.all(orgIds.map((id) => this.orgs.getAncestorIds(id)));
    const reachable = Array.from(new Set(ancestorSets.flat()));
    return mapRows(await this.repo.list(reachable));
  }

  async get(id: string, user: AuthenticatedUser): Promise<RequirementSet> {
    void user;
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ error: 'Requirement set not found', code: 'NOT_FOUND' });
    return mapRow(row);
  }

  async create(body: CreateRequirementSetInput, user: AuthenticatedUser): Promise<RequirementSet> {
    const ability = this.abilityFactory.createForUser(user);
    const isSysadmin = ability.can('manage', 'all');
    let organisationId = body.organisationId ?? null;

    if (!isSysadmin) {
      if (organisationId === null) {
        // Default to caller's first non-student membership
        const first = user.memberships.find((m) => m.role !== 'student');
        organisationId = first?.organisationId ?? null;
      }

      if (organisationId === null) {
        throw new ForbiddenException({
          error: 'Cannot create requirement set for another organisation',
          code: 'FORBIDDEN',
        });
      }

      // CASL gate: only orgadmin/instructor memberships satisfy manage on RequirementSet
      this.assertCanManage(user, organisationId);
    }

    const row = await this.repo.insert({
      name: body.name,
      organisationId,
      effectiveDate: body.effectiveDate,
    });
    return mapRow(row);
  }

  async update(
    id: string,
    body: UpdateRequirementSetInput,
    user: AuthenticatedUser,
  ): Promise<RequirementSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, existing.organisationId);
    const updated = await this.repo.update(id, body);
    if (!updated) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    return mapRow(updated);
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, existing.organisationId);
    await this.repo.delete(id);
  }

  async activate(id: string, user: AuthenticatedUser): Promise<RequirementSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, existing.organisationId);

    // Deactivate sibling active sets and flip the target in one atomic transaction.
    await this.db.transaction(async (tx) => {
      await this.repo.deactivateActiveForOrg(existing.organisationId, tx);
      await this.repo.setActive(id, true, tx);
    });

    const updated = await this.repo.findById(id);
    if (!updated) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    return mapRow(updated);
  }

  async deactivate(id: string, user: AuthenticatedUser): Promise<RequirementSet> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, existing.organisationId);
    await this.repo.setActive(id, false);
    const updated = await this.repo.findById(id);
    if (!updated) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    return mapRow(updated);
  }

  async clone(
    id: string,
    body: CloneRequirementSetInput,
    user: AuthenticatedUser,
  ): Promise<RequirementSet> {
    const source = await this.repo.findById(id);
    if (!source) throw new NotFoundException({ error: 'Not found', code: 'NOT_FOUND' });
    this.assertCanManage(user, source.organisationId);

    const created = await this.repo.insert({
      name: body.name ?? `${source.name} (copy)`,
      organisationId: source.organisationId,
      effectiveDate: source.effectiveDate,
      clonedFromId: source.id,
    });
    // TODO(Task 12): wire RankRequirementsService.deepCopyDetailsForSet(source.id, created.id) here.
    return mapRow(created);
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private assertCanManage(user: AuthenticatedUser, orgId: string | null): void {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('manage', { __caslSubjectType__: 'RequirementSet', organisationId: orgId })) {
      throw new ForbiddenException({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
  }
}
