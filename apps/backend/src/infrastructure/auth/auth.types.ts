/**
 * The shape the rest of the app reads off `req.user`. Derived from the
 * better-auth session payload — we keep this as a hand-written type so the
 * surface is stable even if better-auth's internal types shift between minor
 * versions.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  /** Optional role claim used by CASL rules; populated when present in the session. */
  role?: string | null;
}

export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  session?: { id: string; expiresAt: string };
}
