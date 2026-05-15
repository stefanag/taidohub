import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { type Request } from 'express';

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
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(BETTER_AUTH) private readonly auth: Auth,
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

    req.user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified ?? false,
      name: session.user.name ?? null,
      image: (session.user as { image?: string | null }).image ?? null,
      role: (session.user as { role?: string | null }).role ?? null,
      locale: (session.user as { locale?: string }).locale ?? 'en',
    };

    return true;
  }
}
