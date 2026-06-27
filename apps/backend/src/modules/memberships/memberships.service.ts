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
  CreateMembershipInput,
  ListMembershipsQuery,
  ListMembershipsResponse,
  OrganisationMembership,
  UpdateMembershipInput,
} from '@repo/contracts/memberships';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { AuthUserCache } from '../../infrastructure/auth/auth-user.cache.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { type DbOrganisationMembership } from '../../infrastructure/database/schema/index.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

import { MembershipsRepository } from './memberships.repository.js';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly repo: MembershipsRepository,
    private readonly orgsRepo: OrganisationsRepository,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditLogService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly authUserCache: AuthUserCache,
  ) {}

  async list(
    query: ListMembershipsQuery,
    user: AuthenticatedUser | null,
  ): Promise<ListMembershipsResponse> {
    // Sysadmin sees all. Other callers may either filter by their own userId
    // (self-view) or filter by an organisationId of an org they're orgadmin of
    // (orgadmin-scoped list).
    if (!user) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Can only list your own memberships.' },
      });
    }

    if (user.role !== 'sysadmin') {
      const orgAdminOrgs = user.memberships
        .filter((m) => m.role === 'orgadmin')
        .map((m) => m.organisationId);

      const isOwnUserFilter = query.userId === user.id;
      const isOrgAdminScopedFilter =
        query.organisationId !== undefined && orgAdminOrgs.includes(query.organisationId);

      if (!isOwnUserFilter && !isOrgAdminScopedFilter) {
        throw new ForbiddenException({
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot list memberships outside your own scope.',
          },
        });
      }
    }

    const { data, total } = await this.repo.list(query);
    return { data: data.map((r) => this.toApi(r)), total };
  }

  async create(
    input: CreateMembershipInput,
    user: AuthenticatedUser,
  ): Promise<OrganisationMembership> {
    this.assertCan(user, 'create');

    const org = await this.orgsRepo.findById(input.organisationId);
    if (!org) {
      throw new BadRequestException({
        error: { code: 'INVALID_ORGANISATION', message: `Organisation ${input.organisationId} not found.` },
      });
    }
    this.validateRoleAgainstOrgType(input.role, org.type as string);

    const existing = await this.repo.findExact(input.userId, input.organisationId, input.role);
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'MEMBERSHIP_EXISTS',
          message: 'A membership with the same user, organisation, and role already exists.',
        },
      });
    }

    const created = await this.db.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'organisation_membership',
        entityId: row.id,
        action: 'create',
        userId: user.id,
        impersonatedById: user.impersonatedBy ?? null,
        actingUserId: null,
        before: null,
        after,
      });
      return after;
    });
    // Membership change feeds the cached `req.user.memberships`.
    this.authUserCache.invalidate(input.userId);
    return created;
  }

  async update(
    id: string,
    input: UpdateMembershipInput,
    user: AuthenticatedUser,
  ): Promise<OrganisationMembership> {
    this.assertCan(user, 'update');

    const existing = await this.requireById(id);
    const org = await this.orgsRepo.findById(existing.organisationId);
    if (!org) {
      throw new BadRequestException({
        error: { code: 'INVALID_ORGANISATION', message: 'Membership references a missing organisation.' },
      });
    }
    this.validateRoleAgainstOrgType(input.role, org.type as string);

    const updated = await this.db.transaction(async (tx) => {
      const row = await this.repo.update(id, input, tx);
      if (!row) throw new NotFoundException(this.notFound(id));
      const before = this.toApi(existing);
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'organisation_membership',
        entityId: row.id,
        action: 'update',
        userId: user.id,
        impersonatedById: user.impersonatedBy ?? null,
        actingUserId: null,
        before,
        after,
      });
      return after;
    });
    this.authUserCache.invalidate(existing.userId);
    return updated;
  }

  async delete(
    id: string,
    user: AuthenticatedUser,
    opts: { confirm?: boolean } = {},
  ): Promise<void> {
    this.assertCan(user, 'delete');
    const existing = await this.requireById(id);

    // Self-demote: a non-sysadmin cannot remove their own orgadmin row.
    if (
      existing.role === 'orgadmin' &&
      existing.userId === user.id &&
      user.role !== 'sysadmin'
    ) {
      throw new ForbiddenException({
        error: {
          code: 'SELF_DEMOTE_BLOCKED',
          message: 'Orgadmins cannot remove their own orgadmin role.',
        },
      });
    }

    // Last-orgadmin: sysadmin-only path (CASL already blocks orgadmins from
    // touching orgadmin rows). Soft block — frontend re-issues with confirm.
    if (existing.role === 'orgadmin' && user.role === 'sysadmin') {
      const remaining = await this.repo.countOrgadminsForOrg(existing.organisationId);
      if (remaining <= 1 && !opts.confirm) {
        throw new ConflictException({
          error: {
            code: 'LAST_ORGADMIN',
            message: 'This is the last orgadmin in the organisation.',
          },
        });
      }
    }

    await this.db.transaction(async (tx) => {
      await this.repo.delete(id, tx);
      await this.audit.record({
        tx,
        entityType: 'organisation_membership',
        entityId: id,
        action: 'delete',
        userId: user.id,
        impersonatedById: user.impersonatedBy ?? null,
        actingUserId: null,
        before: this.toApi(existing),
        after: null,
      });
    });
    this.authUserCache.invalidate(existing.userId);
  }

  private validateRoleAgainstOrgType(
    role: 'orgadmin' | 'instructor' | 'student',
    orgType: string,
  ): void {
    if (role === 'instructor' && orgType !== 'club') {
      throw new BadRequestException({
        error: {
          code: 'INSTRUCTOR_REQUIRES_CLUB',
          message: 'Instructor memberships are only allowed on clubs.',
        },
      });
    }
    if (role === 'student' && orgType !== 'club') {
      throw new BadRequestException({
        error: {
          code: 'STUDENT_REQUIRES_CLUB',
          message: 'Student memberships are only allowed on clubs.',
        },
      });
    }
  }

  private assertCan(user: AuthenticatedUser | null, action: 'create' | 'read' | 'update' | 'delete'): void {
    const ability = this.abilities.createForUser(user);
    try {
      // Bare-string subject check is safe here: `OrganisationMembership` has
      // exactly one rule — `manage`, granted unconditionally to sysadmin only
      // (see MembershipsAbilityRules). There is no conditional rule for this
      // subject, so a non-sysadmin holds zero rules and the check correctly
      // fails. If a conditional OrganisationMembership rule is ever added,
      // this MUST switch to an instance subject (see OrganisationsService).
      ForbiddenError.from(ability).throwUnlessCan(action, 'OrganisationMembership');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: err.message } });
      }
      throw err;
    }
  }

  private async requireById(id: string): Promise<DbOrganisationMembership> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException(this.notFound(id));
    return row;
  }

  private notFound(id: string) {
    return { error: { code: 'NOT_FOUND', message: `Membership ${id} not found.` } };
  }

  private toApi(
    row: DbOrganisationMembership | (DbOrganisationMembership & { userName?: string | null; userEmail?: string | null }),
  ): OrganisationMembership {
    const base: OrganisationMembership = {
      id: row.id,
      userId: row.userId,
      organisationId: row.organisationId,
      role: row.role as 'orgadmin' | 'instructor' | 'student',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    // Only the list query joins user; surface the joined fields when
    // present so the orgadmin UI can render real names instead of
    // raw user ids.
    if ('userName' in row && row.userName !== undefined) {
      base.userName = row.userName;
    }
    if ('userEmail' in row && row.userEmail !== undefined) {
      base.userEmail = row.userEmail;
    }
    return base;
  }
}
