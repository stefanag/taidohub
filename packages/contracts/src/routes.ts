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

/**
 * Self-service account actions handled by NestJS. Deliberately NOT under
 * `/api/auth/*` — better-auth's handler owns that prefix as a catch-all and
 * would 404 any path it does not recognise.
 */
export const AccountRoutes = {
  setPassword: '/api/account/set-password',
} as const;

export const UsersRoutes = {
  base: '/api/users',
  me: '/api/users/me',
  byId: (id: string) => `/api/users/${id}` as const,
  invite: '/api/users/invite',
  deactivate: (id: string) => `/api/users/${id}/deactivate` as const,
  reactivate: (id: string) => `/api/users/${id}/reactivate` as const,
  sendPasswordReset: (id: string) => `/api/users/${id}/send-password-reset` as const,
} as const;

export const HealthRoute = '/api/health' as const;

export const OrganisationsRoutes = {
  base: '/api/admin/organisations',
  byId: (id: string) => `/api/admin/organisations/${id}` as const,
} as const;

export const AuditLogRoutes = {
  base: '/api/admin/audit-log',
} as const;

export const MembershipsRoutes = {
  base: '/api/memberships',
  byId: (id: string) => `/api/memberships/${id}` as const,
} as const;
