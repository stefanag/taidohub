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
  add: '/api/users/add',
  deactivate: (id: string) => `/api/users/${id}/deactivate` as const,
  reactivate: (id: string) => `/api/users/${id}/reactivate` as const,
  sendPasswordReset: (id: string) => `/api/users/${id}/send-password-reset` as const,
  meProfile: '/api/users/me/profile',
  profileById: (id: string) => `/api/users/${id}/profile` as const,
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

export const BeltSystemsRoutes = {
  base: '/api/belt-systems',
  byId: (id: string) => `/api/belt-systems/${id}` as const,
} as const;

export const BeltRanksRoutes = {
  base: '/api/ranks',
  byId: (id: string) => `/api/ranks/${id}` as const,
} as const;

export const ShogoTitlesRoutes = {
  base: '/api/shogo-titles',
  byCode: (code: string) => `/api/shogo-titles/${code}` as const,
} as const;

export const RankHistoryRoutes = {
  byUser: (userId: string) => `/api/rank-history/${userId}` as const,
  byId: (id: string) => `/api/rank-history/${id}` as const,
  verify: (id: string) => `/api/rank-history/${id}/verify` as const,
  unverify: (id: string) => `/api/rank-history/${id}/unverify` as const,
  unifiedForUser: (userId: string) => `/api/grading-events/history/${userId}` as const,
} as const;

export const PublicRoutes = {
  rankBySlug: (slug: string) => `/api/public/ranks/${slug}` as const,
} as const;
