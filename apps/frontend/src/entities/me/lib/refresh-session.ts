import { authClient } from '@/features/auth-by-email';

/**
 * Trigger a better-auth session re-fetch. Fire-and-forget — callers
 * don't await the result; the session store updates whenever the
 * request resolves.
 *
 * Used after mutations that change actor-level fields (e.g. a
 * shogo-title verification syncs onto `user_profile`) so the
 * sidebar / header reflect the new state without a full reload.
 *
 * Sits in `entities/me` for the same reason `useSession` does — this
 * is a read-only "current actor" concern. The actual `authClient` is
 * still owned by `features/auth-by-email` (better-auth's wire adapter
 * lives there); we just expose a focused helper so callers OUTSIDE
 * the auth feature don't have to import the full client.
 *
 * The `steiger.config.js` override for `entities/me/**` covers the
 * cross-feature import below.
 */
export function refreshSession(): void {
  void authClient.getSession();
}
