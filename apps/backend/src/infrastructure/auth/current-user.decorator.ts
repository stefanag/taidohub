import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { type AuthenticatedUser } from './auth.types.js';

/**
 * Resolves the user attached by `AuthGuard`. Throws nothing — if the route is
 * `@Public()` and there is no session, `user` will be `undefined` and the
 * downstream handler is responsible for tolerating that.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return req.user;
  },
);
