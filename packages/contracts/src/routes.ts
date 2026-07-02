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

export const FeedbackRoutes = {
  /** GET ?entityType=&entityId=&studentId= → thread | null. */
  threads: '/api/feedback/threads',
  /** GET → threads[] for a single student. */
  threadsByStudent: (studentId: string) =>
    `/api/feedback/threads/student/${studentId}` as const,
  /** GET → comments[] for one thread. POST → create comment. */
  threadComments: (threadId: string) =>
    `/api/feedback/threads/${threadId}/comments` as const,
  /** POST → upsert per-(thread, user) last-read timestamp. */
  threadRead: (threadId: string) =>
    `/api/feedback/threads/${threadId}/read` as const,
  /** PATCH / DELETE on a single comment (author + 24h window). */
  commentById: (commentId: string) =>
    `/api/feedback/comments/${commentId}` as const,
  /** PUT (upsert-replace) / DELETE the actor's reaction on a comment. */
  commentReactions: (commentId: string) =>
    `/api/feedback/comments/${commentId}/reactions` as const,
  /** GET → { count } of threads with unread visible comments for the actor. */
  unreadCount: '/api/feedback/unread-count',
  /** GET → inbox: threads with unread activity, with student name + context label prejoined. */
  inbox: '/api/feedback/inbox',
} as const;

export const RequirementSetsRoutes = {
  base: '/api/requirement-sets',
  byId: (id: string) => `/api/requirement-sets/${id}` as const,
  activate: (id: string) => `/api/requirement-sets/${id}/activate` as const,
  deactivate: (id: string) => `/api/requirement-sets/${id}/deactivate` as const,
  clone: (id: string) => `/api/requirement-sets/${id}/clone` as const,
} as const;

export const RankRequirementsRoutes = {
  byRankId: (rankId: string) => `/api/requirements/${rankId}` as const,
} as const;
