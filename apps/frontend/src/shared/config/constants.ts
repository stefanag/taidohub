import {
  AuthRoutes,
  HealthRoute,
  PostsRoutes,
  UsersRoutes,
} from '@repo/contracts/routes';

/**
 * Re-export typed route constants from `@repo/contracts/routes` so frontend
 * code references them by import alias rather than scattering string literals.
 * Helps keep request paths in lock-step with the backend's controller paths.
 */
export const ApiRoutes = {
  Auth: AuthRoutes,
  Users: UsersRoutes,
  Posts: PostsRoutes,
  Health: HealthRoute,
} as const;
