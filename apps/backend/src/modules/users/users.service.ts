import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenError } from '@casl/ability';
import {
  type ListUsersQuery,
  type ListUsersResponse,
  type Role,
  type User,
} from '@repo/contracts/users';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly abilities: AbilityFactory,
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
