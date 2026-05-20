import type { Role } from '@repo/contracts/users';
import type { MembershipRole } from '@repo/contracts/memberships';

/**
 * The shape the rest of the app reads off `req.user`. Derived from the
 * better-auth session payload plus a per-request hydration step that loads
 * the user's `organisation_membership` rows.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  /** Global role. Narrowed from the open-string column to the contract enum. */
  role: Role;
  locale: string;
  /** Null = active; ISO string = the moment the user was deactivated. */
  deactivatedAt: string | null;
  /** Hydrated by `AuthGuard` from `organisation_membership`. Empty array if none. */
  memberships: ReadonlyArray<{ organisationId: string; role: MembershipRole }>;
}

export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  session?: { id: string; expiresAt: string };
}
