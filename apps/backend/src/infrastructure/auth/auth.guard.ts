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

import { AuthUserCache, type CachedAuthUser } from './auth-user.cache.js';
import { type Auth, BETTER_AUTH } from './better-auth.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { type AuthenticatedUser } from './auth.types.js';
import { UserContextService } from './user-context.service.js';

/**
 * Global guard that turns the better-auth session cookie into `req.user`.
 *
 * - Routes decorated `@Public()` skip the check entirely.
 * - Routes mounted under `/api/auth/*` are handled by better-auth's own
 *   express handler before Nest ever sees them, so they don't reach this
 *   guard.
 * - The user-row + memberships tuple is cached in {@link AuthUserCache}
 *   with a short TTL (Chunk 3.2). On a cache hit the guard performs no
 *   DB work beyond better-auth's session validation; on a miss it
 *   parallelises the two reads. Mutation paths that change role,
 *   deactivation, or membership call `cache.invalidate(userId)` so the
 *   next request sees fresh state.
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
    private readonly userContext: UserContextService,
    private readonly userCache: AuthUserCache,
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
    // Cache the tuple so repeat requests within the TTL window skip both
    // reads. On a cache miss the two SELECTs are parallelised — they're
    // independent so there's no reason to wait for the user row before
    // firing the memberships query.
    let cached: CachedAuthUser;
    try {
      cached = await this.userCache.getOrLoad(sessionUser.id, async () => {
        const [rows, memberships] = await Promise.all([
          this.db
            .select({
              role: userTable.role,
              deactivatedAt: userTable.deactivatedAt,
            })
            .from(userTable)
            .where(eq(userTable.id, sessionUser.id))
            .limit(1),
          this.db
            .select({
              organisationId: organisationMembership.organisationId,
              role: organisationMembership.role,
            })
            .from(organisationMembership)
            .where(eq(organisationMembership.userId, sessionUser.id)),
        ]);
        const row = rows[0];
        if (!row) {
          // Bubble up via a sentinel — getOrLoad doesn't distinguish
          // miss from "user gone." Throwing here keeps the cache empty
          // for this id (the loader rejection skips the .set call).
          throw new UnauthorizedException({
            error: { code: 'UNAUTHORIZED', message: 'User no longer exists.' },
          });
        }
        return {
          role: row.role as Role,
          deactivatedAt: row.deactivatedAt ?? null,
          memberships: memberships.map((m) => ({
            organisationId: m.organisationId,
            role: m.role as MembershipRole,
          })),
        };
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw err;
    }

    if (cached.deactivatedAt !== null) {
      throw new ForbiddenException({
        error: { code: 'DEACTIVATED', message: 'Account is deactivated.' },
      });
    }

    const rawImpersonatedBy = (session.session as { impersonatedBy?: string | null })
      .impersonatedBy;
    const impersonatedBy =
      typeof rawImpersonatedBy === 'string' && rawImpersonatedBy.length > 0
        ? rawImpersonatedBy
        : undefined;

    req.user = {
      id: sessionUser.id,
      email: sessionUser.email,
      emailVerified: sessionUser.emailVerified ?? false,
      name: sessionUser.name ?? null,
      image: sessionUser.image ?? null,
      role: cached.role,
      locale: sessionUser.locale ?? 'en',
      deactivatedAt: null,
      memberships: cached.memberships,
      ...(impersonatedBy !== undefined ? { impersonatedBy } : {}),
    };

    // Bind the user (and a placeholder ability slot) to the rest of
    // this request's async chain so downstream services can call
    // `AbilityFactory.forCurrentRequest()` without rebuilding the
    // 14-rule tree on every check.
    this.userContext.enter(req.user);

    return true;
  }
}
