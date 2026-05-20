import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ForbiddenError } from '@casl/ability';
import type {
  CreateOrganisationInput,
  IsoAlpha3,
  ListOrganisationsQuery,
  ListOrganisationsResponse,
  Organisation,
  OrganisationType,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { type DbOrganisation } from '../../infrastructure/database/schema/index.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

import { OrganisationsRepository } from './organisations.repository.js';

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly repo: OrganisationsRepository,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditLogService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async list(query: ListOrganisationsQuery, user: AuthenticatedUser | null): Promise<ListOrganisationsResponse> {
    const { data } = await this.repo.list(query);
    // Filter to organisations the user can actually `read` as an instance.
    // A sysadmin's unconditional `manage all` matches every row; an
    // orgadmin/instructor only matches rows their memberships bind to.
    const ability = this.abilities.createForUser(user);
    const visible = data.filter((r) =>
      ability.can('read', { __caslSubjectType__: 'Organisation', id: r.id }),
    );
    return { data: visible.map((r) => this.toApi(r)), total: visible.length };
  }

  async findOne(id: string, user: AuthenticatedUser | null): Promise<Organisation> {
    const row = await this.requireById(id);
    this.assertCan(user, 'read', row.id);
    return this.toApi(row);
  }

  async create(input: CreateOrganisationInput, user: AuthenticatedUser): Promise<Organisation> {
    this.assertCan(user, 'create');
    await this.validateHierarchy(input.type, input.parentId);
    return this.db.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'organisation',
        entityId: row.id,
        action: 'create',
        userId: user.id,
        before: null,
        after,
      });
      return after;
    });
  }

  async update(id: string, input: UpdateOrganisationInput, user: AuthenticatedUser): Promise<Organisation> {
    const existing = await this.requireById(id);
    this.assertCan(user, 'update', existing.id);

    if (input.parentId !== undefined) {
      await this.validateHierarchy(existing.type, input.parentId);
      if (input.parentId !== null) {
        await this.assertNoCycle(id, input.parentId);
      }
    }

    // The country/type cross-field rule can't be enforced by
    // `UpdateOrganisationSchema` — patches don't carry `type` (it's
    // immutable). Apply it here against the existing row's type.
    this.validateCountryForType(existing.type as OrganisationType, input.country);

    return this.db.transaction(async (tx) => {
      const row = await this.repo.update(id, input, tx);
      if (!row) throw new NotFoundException(this.notFound(id));
      const before = this.toApi(existing);
      const after = this.toApi(row);

      // Pure reparent → action = 'move'; otherwise 'update'.
      const inputKeys = Object.keys(input);
      const isOnlyParentChange =
        inputKeys.length === 1 &&
        inputKeys[0] === 'parentId' &&
        input.parentId !== existing.parentId;

      await this.audit.record({
        tx,
        entityType: 'organisation',
        entityId: row.id,
        action: isOnlyParentChange ? 'move' : 'update',
        userId: user.id,
        before,
        after,
      });
      return after;
    });
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.requireById(id);
    this.assertCan(user, 'delete', existing.id);
    const childCount = await this.repo.countChildren(id);
    if (childCount > 0) {
      throw new ConflictException({
        error: { code: 'HAS_CHILDREN', message: `Organisation ${id} still has ${childCount} child(ren).` },
      });
    }
    await this.db.transaction(async (tx) => {
      await this.repo.delete(id, tx);
      await this.audit.record({
        tx,
        entityType: 'organisation',
        entityId: id,
        action: 'delete',
        userId: user.id,
        before: this.toApi(existing),
        after: null,
      });
    });
  }

  private async validateHierarchy(type: OrganisationType, parentId: string | null): Promise<void> {
    if (type === 'international_federation') {
      if (parentId !== null) {
        throw new BadRequestException({
          error: { code: 'INVALID_PARENT', message: 'International federations cannot have a parent.' },
        });
      }
      return;
    }
    if (parentId === null) {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: `A ${type} must have a parent.` },
      });
    }
    const parent = await this.repo.findById(parentId);
    if (!parent) {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: `Parent ${parentId} not found.` },
      });
    }
    if (type === 'national_federation' && parent.type !== 'international_federation') {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: 'National federations must be parented by an international federation.' },
      });
    }
    if (type === 'club' && parent.type !== 'national_federation' && parent.type !== 'club') {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: 'A club must be parented by a national federation or another club.' },
      });
    }
  }

  private validateCountryForType(type: OrganisationType, country: string | null | undefined): void {
    if (country === undefined) return; // not being patched
    if (type === 'international_federation' && country !== null) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_COUNTRY',
          message: 'International federations must not have a country.',
        },
      });
    }
    if (type !== 'international_federation' && country === null) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_COUNTRY',
          message: 'Country is required for national federations and clubs.',
        },
      });
    }
  }

  /** Walk up from `parentId`; if we reach `nodeId`, that's a cycle. */
  private async assertNoCycle(nodeId: string, parentId: string): Promise<void> {
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor !== null) {
      if (cursor === nodeId) {
        throw new BadRequestException({
          error: { code: 'CYCLE', message: 'Reparenting would create a cycle.' },
        });
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const row = await this.repo.findById(cursor);
      cursor = row?.parentId ?? null;
    }
  }

  /**
   * Authorize `action` against the `Organisation` subject.
   *
   * When `organisationId` is supplied the check runs against an *instance*
   * subject so CASL evaluates the per-org `{ id }` conditions in the rule set
   * — a bare subject-type string would short-circuit to `true` for any user
   * who holds any `Organisation` rule, defeating per-org scoping. Omitting
   * `organisationId` (e.g. for `create`) means no `id` to match, so a
   * conditional `{ id: X }` orgadmin rule cannot satisfy it — only a
   * sysadmin's unconditional `manage all` passes.
   */
  private assertCan(
    user: AuthenticatedUser | null,
    action: 'create' | 'read' | 'update' | 'delete',
    organisationId?: string,
  ): void {
    const ability = this.abilities.createForUser(user);
    const subject = organisationId
      ? ({ __caslSubjectType__: 'Organisation', id: organisationId } as const)
      : ({ __caslSubjectType__: 'Organisation' } as const);
    try {
      ForbiddenError.from(ability).throwUnlessCan(action, subject);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: err.message },
        });
      }
      throw err;
    }
  }

  private async requireById(id: string): Promise<DbOrganisation> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException(this.notFound(id));
    return row;
  }

  private notFound(id: string) {
    return { error: { code: 'NOT_FOUND', message: `Organisation ${id} not found.` } };
  }

  private toApi(row: DbOrganisation): Organisation {
    return {
      id: row.id,
      parentId: row.parentId,
      type: row.type as OrganisationType,
      shortCode: row.shortCode,
      slug: row.slug,
      country: row.country as IsoAlpha3 | null,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      nameJa: row.nameJa,
      logoUrl: row.logoUrl,
      address: row.address,
      contactEmail: row.contactEmail,
      headInstructorId: row.headInstructorId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
