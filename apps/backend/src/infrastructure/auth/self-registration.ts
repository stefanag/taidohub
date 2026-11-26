import { eq } from 'drizzle-orm';

import { type DrizzleDb } from '../database/client.js';
import { userProfile, user as userTable } from '../database/schema/index.js';

/**
 * Self-registered accounts (see docs/superpowers/plans/2026-11-26-self-registration.md)
 * must confirm their email address before signing in. Invited and
 * admin-created users confirm theirs through the set-password link instead,
 * so the rule only applies where `user_profile.self_registered_at` is set.
 *
 * Lives in infrastructure/auth next to mcp-access.ts for the same reason: it
 * runs inside better-auth's hooks, before any Nest service exists.
 */
export async function isSelfRegistered(db: DrizzleDb, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ at: userProfile.selfRegisteredAt })
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  return row?.at != null;
}

/** True when `email` belongs to a self-registered account that has not confirmed it yet. */
export async function isUnverifiedSelfRegistered(db: DrizzleDb, email: string): Promise<boolean> {
  const [row] = await db
    .select({ verified: userTable.emailVerified, selfRegisteredAt: userProfile.selfRegisteredAt })
    .from(userTable)
    .innerJoin(userProfile, eq(userProfile.userId, userTable.id))
    .where(eq(userTable.email, email.trim().toLowerCase()))
    .limit(1);
  return row !== undefined && row.selfRegisteredAt !== null && !row.verified;
}
