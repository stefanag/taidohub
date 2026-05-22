import { randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForbiddenError } from '@casl/ability';
import {
  type InviteUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type Role,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { EMAIL_SERVICE, type EmailService } from '../../infrastructure/email/email.types.js';
import { type Env } from '../../config/env.schema.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditLogService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService<Env, true>,
    private readonly tokens: VerificationTokenService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  async findOne(id: string, user: AuthenticatedUser | null): Promise<User> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    // Instance check: a sysadmin's `manage User` matches; a plain user only
    // matches when the row is their own (`read User { id: self }`). A bare
    // subject-type string would short-circuit to `true` for any user holding
    // any `User` rule, defeating per-user scoping.
    this.assertCan(user, 'read', row.id);
    return this.toApi(row);
  }

  async list(
    query: ListUsersQuery,
    user: AuthenticatedUser | null,
  ): Promise<ListUsersResponse> {
    // Sysadmin-only gate: a sysadmin has `manage all` (covers `manage User`);
    // a plain user holds only a conditional `read User` rule, so the bare
    // `manage` check correctly fails for them.
    this.assertCan(user, 'manage');
    const { rows, total } = await this.repo.list({
      ...(query.q !== undefined && { q: query.q }),
      ...(query.role !== undefined && { role: query.role }),
      deactivated: query.deactivated,
      page: query.page,
      perPage: query.perPage,
    });
    return {
      data: rows.map((r) => this.toApi(r)),
      total,
      page: query.page,
      perPage: query.perPage,
    };
  }

  async update(
    id: string,
    input: UpdateUserInput,
    user: AuthenticatedUser,
  ): Promise<User> {
    // Updating users is sysadmin-only. The bare `manage` check is correct:
    // only a sysadmin holds a `manage` rule for `User`.
    this.assertCan(user, 'manage');

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }

    // Self-protection: a sysadmin cannot change their own role — a different
    // sysadmin must do it. In practice the only self role-change reachable
    // here is sysadmin -> user (a demotion).
    if (input.role !== undefined && input.role !== existing.role && id === user.id) {
      throw new ConflictException({
        error: { code: 'SELF_DEMOTE', message: 'You cannot change your own role.' },
      });
    }

    // Build a patch with only the fields explicitly provided, satisfying
    // exactOptionalPropertyTypes (absent key !== key-with-undefined).
    const patch: { name?: string; role?: string } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.role !== undefined) patch.role = input.role;

    return this.db.transaction(async (tx) => {
      // Self-protection: never leave the system with zero active sysadmins.
      // Counted inside the transaction so the read and the write commit
      // together.
      if (input.role === 'user' && existing.role === 'sysadmin') {
        const remaining = await this.repo.countActiveSysadmins(tx);
        if (remaining <= 1) {
          throw new ConflictException({
            error: {
              code: 'LAST_SYSADMIN',
              message: 'Cannot demote the last active sysadmin.',
            },
          });
        }
      }

      const row = await this.repo.update(id, patch, tx);
      if (!row) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
        });
      }
      const before = this.toApi(existing);
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: row.id,
        action: 'update',
        userId: user.id,
        before,
        after,
      });
      return after;
    });
  }

  /** Soft-deactivate a user. Self-deactivation and last-sysadmin are blocked. */
  async deactivate(id: string, adminUser: AuthenticatedUser): Promise<User> {
    this.assertCan(adminUser, 'manage');

    if (id === adminUser.id) {
      throw new ConflictException({
        error: { code: 'SELF_DEACTIVATE', message: 'You cannot deactivate yourself.' },
      });
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    if (existing.deactivatedAt !== null) {
      throw new ConflictException({
        error: { code: 'ALREADY_DEACTIVATED', message: 'This user is already deactivated.' },
      });
    }

    return this.db.transaction(async (tx) => {
      if (existing.role === 'sysadmin') {
        const remaining = await this.repo.countActiveSysadmins(tx);
        if (remaining <= 1) {
          throw new ConflictException({
            error: {
              code: 'LAST_SYSADMIN',
              message: 'Cannot deactivate the last active sysadmin.',
            },
          });
        }
      }
      const row = await this.repo.deactivate(id, tx);
      if (!row) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
        });
      }
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'deactivate',
        userId: adminUser.id,
        before: this.toApi(existing),
        after,
      });
      return after;
    });
  }

  /** Clear a user's deactivation. */
  async reactivate(id: string, adminUser: AuthenticatedUser): Promise<User> {
    this.assertCan(adminUser, 'manage');

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }
    if (existing.deactivatedAt === null) {
      throw new ConflictException({
        error: { code: 'ALREADY_ACTIVE', message: 'This user is already active.' },
      });
    }

    return this.db.transaction(async (tx) => {
      const row = await this.repo.reactivate(id, tx);
      if (!row) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
        });
      }
      const after = this.toApi(row);
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'reactivate',
        userId: adminUser.id,
        before: this.toApi(existing),
        after,
      });
      return after;
    });
  }

  /**
   * Hard-delete a user. FK cascades remove their sessions, accounts, and
   * memberships. Blocked for self and for the last active sysadmin. A
   * deactivated sysadmin can be deleted as long as another active one exists.
   */
  async delete(id: string, adminUser: AuthenticatedUser): Promise<void> {
    this.assertCan(adminUser, 'manage');

    if (id === adminUser.id) {
      throw new ConflictException({
        error: { code: 'SELF_DELETE', message: 'You cannot delete yourself.' },
      });
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` },
      });
    }

    await this.db.transaction(async (tx) => {
      if (existing.role === 'sysadmin' && existing.deactivatedAt === null) {
        const remaining = await this.repo.countActiveSysadmins(tx);
        if (remaining <= 1) {
          throw new ConflictException({
            error: {
              code: 'LAST_SYSADMIN',
              message: 'Cannot delete the last active sysadmin.',
            },
          });
        }
      }
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'delete',
        userId: adminUser.id,
        before: this.toApi(existing),
        after: null,
      });
      await this.repo.delete(id, tx);
    });
  }

  /**
   * Invite a new user by email. Three branches:
   * - email belongs to an active user → 409 EMAIL_IN_USE
   * - email belongs to a deactivated user → 409 EMAIL_DEACTIVATED
   * - email belongs to a still-pending invitee (has an unexpired invite
   *   token) → re-issue the token and re-send the email, no new row
   * Otherwise inserts a fresh `role: 'user'` row, issues an invite token, and
   * sends the invite email. The set-password URL points at the first
   * configured WEB_ORIGIN.
   */
  async invite(input: InviteUserInput, adminUser: AuthenticatedUser): Promise<User> {
    this.assertCan(adminUser, 'manage');

    const webOrigin = this.config
      .get('WEB_ORIGIN', { infer: true })
      .split(',')[0]
      ?.trim();
    if (!webOrigin) {
      throw new Error('WEB_ORIGIN is not configured.');
    }
    const ttl = this.config.get('INVITE_TOKEN_TTL_HOURS', { infer: true });

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      if (existing.deactivatedAt !== null) {
        throw new ConflictException({
          error: {
            code: 'EMAIL_DEACTIVATED',
            message: 'A deactivated user already has this email. Reactivate them instead.',
          },
        });
      }
      const pending = await this.tokens.hasUnexpiredToken(`invite:${existing.id}`);
      if (pending) {
        const token = await this.tokens.issueToken(`invite:${existing.id}`, ttl);
        await this.email.sendInvite({
          to: existing.email,
          locale: existing.locale,
          setPasswordUrl: `${webOrigin}/set-password?token=${token}`,
          inviterName: adminUser.name,
        });
        return this.toApi(existing);
      }
      throw new ConflictException({
        error: { code: 'EMAIL_IN_USE', message: 'A user with this email already exists.' },
      });
    }

    const id = randomUUID();
    const row = await this.db.transaction(async (tx) => {
      const created = await this.repo.insert(
        {
          id,
          email: input.email,
          ...(input.name !== undefined && { name: input.name }),
          role: 'user',
          emailVerified: false,
        },
        tx,
      );
      await this.audit.record({
        tx,
        entityType: 'user',
        entityId: id,
        action: 'create',
        userId: adminUser.id,
        before: null,
        after: this.toApi(created),
      });
      return created;
    });

    const token = await this.tokens.issueToken(`invite:${row.id}`, ttl);
    await this.email.sendInvite({
      to: input.email,
      locale: row.locale,
      setPasswordUrl: `${webOrigin}/set-password?token=${token}`,
      inviterName: adminUser.name,
    });

    return this.toApi(row);
  }

  /**
   * Authorize `action` against the `User` subject.
   *
   * When `userId` is supplied the check runs against an *instance* subject so
   * CASL evaluates the per-user `{ id }` condition in the rule set. Omitting
   * `userId` means there is no `id` to match, so a conditional `{ id: self }`
   * rule cannot satisfy the check — only a sysadmin's unconditional
   * `manage all` passes.
   */
  private assertCan(
    user: AuthenticatedUser | null,
    action: 'read' | 'manage',
    userId?: string,
  ): void {
    const ability = this.abilities.createForUser(user);
    const subject = userId
      ? ({ __caslSubjectType__: 'User', id: userId } as const)
      : ({ __caslSubjectType__: 'User' } as const);
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

  /** Map the internal Drizzle row to the API-facing shape from `@repo/contracts`. */
  private toApi(row: {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    image: string | null;
    role: string;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: row.emailVerified,
      image: row.image,
      role: row.role as Role,
      deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
