/**
 * Typed route path constants shared by frontend (fetch/TanStack Query) and
 * backend (controller path discovery, e2e tests). Functions are used for
 * parameterised paths so call sites get a typed `id`.
 */

export const AuthRoutes = {
  base: '/api/auth',
  signIn: '/api/auth/sign-in/email',
  signUp: '/api/auth/sign-up/email',
  signOut: '/api/auth/sign-out',
  session: '/api/auth/get-session',
} as const;

export const UsersRoutes = {
  base: '/api/users',
  me: '/api/users/me',
  byId: (id: string) => `/api/users/${id}` as const,
} as const;

export const PostsRoutes = {
  base: '/api/posts',
  byId: (id: string) => `/api/posts/${id}` as const,
} as const;

export const HealthRoute = '/api/health' as const;

export const OrganisationsRoutes = {
  base: '/api/admin/organisations',
  byId: (id: string) => `/api/admin/organisations/${id}` as const,
} as const;
