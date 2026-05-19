import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { type Request } from 'express';
import type { Role } from '@repo/contracts/users';
import type { MembershipRole } from '@repo/contracts/memberships';

import { DRIZZLE, type DrizzleDb } from '../database/client.js';
import { organisationMembership, user as userTable } from '../database/schema/index.js';

import { type Auth, BETTER_AUTH } from './better-auth.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { type AuthenticatedUser } from './auth.types.js';

/**
 * Global guard that turns the better-auth session cookie into `req.user`.
 *
 * - Routes decorated `@Public()` skip the check entirely.
 * - Routes mounted under `/api/auth/*` are handled by better-auth's own
 *   express handler before Nest ever sees them, so they don't reach this
 *   guard.
 * - The hydrated `req.user.memberships` loads on every request. Profile if
 *   it becomes a bottleneck; v1 keeps it simple.
 * - Deactivated users (where `user.deactivated_at IS NOT NULL`) are
 *   rejected with 403 even when their session is still valid — fresh
 *   sign-in is blocked too because better-auth's own check sees the row.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(BETTER_AUTH) private readonly auth: Auth,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      });
    }

    const sessionUser = session.user as {
      id: string;
      email: string;
      emailVerified?: boolean;
      name?: string | null;
      image?: string | null;
      role?: string | null;
      locale?: string;
    };

    // Reload the row so we see deactivated_at and the authoritative role,
    // not whatever was cached in the session cookie at sign-in time.
    const rows = await this.db
      .select({
        role: userTable.role,
        deactivatedAt: userTable.deactivatedAt,
      })
      .from(userTable)
      .where(eq(userTable.id, sessionUser.id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'User no longer exists.' },
      });
    }

    const deactivatedAt: Date | null = row.deactivatedAt ?? null;

    if (deactivatedAt !== null) {
      throw new ForbiddenException({
        error: { code: 'DEACTIVATED', message: 'Account is deactivated.' },
      });
    }

    const memberships = await this.db
      .select({
        organisationId: organisationMembership.organisationId,
        role: organisationMembership.role,
      })
      .from(organisationMembership)
      .where(eq(organisationMembership.userId, sessionUser.id));

    req.user = {
      id: sessionUser.id,
      email: sessionUser.email,
      emailVerified: sessionUser.emailVerified ?? false,
      name: sessionUser.name ?? null,
      image: sessionUser.image ?? null,
      role: row.role as Role,
      locale: sessionUser.locale ?? 'en',
      deactivatedAt: null,
      memberships: memberships.map((m) => ({
        organisationId: m.organisationId,
        role: m.role as MembershipRole,
      })),
    };

    return true;
  }
}
