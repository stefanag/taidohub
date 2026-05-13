import { SetMetadata } from '@nestjs/common';

/** Reflector key used by `AuthGuard` to skip session validation. */
export const IS_PUBLIC_KEY = 'is-public';

/**
 * Marks a route as not requiring an authenticated session. The global
 * `AuthGuard` reads this via `Reflector` and short-circuits when present.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
