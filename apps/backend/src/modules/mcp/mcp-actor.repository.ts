import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { organisationMembership, user } from '../../infrastructure/database/schema/index.js';

import type { MembershipRole } from '@repo/contracts/memberships';
import type { Role } from '@repo/contracts/users';

/**
 * Loads the acting user for an MCP request from the access token's subject.
 *
 * MCP requests carry a bearer token rather than the session cookie, so the
 * global `AuthGuard` never runs for them. This reads the same two things the
 * guard reads (the user row and its memberships) on every request, so a role
 * change or deactivation takes effect at once, whatever the token says.
 */
@Injectable()
export class McpActorRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async load(userId: string): Promise<AuthenticatedUser | null> {
    const [rows, memberships] = await Promise.all([
      this.db.select().from(user).where(eq(user.id, userId)).limit(1),
      this.db
        .select({
          organisationId: organisationMembership.organisationId,
          role: organisationMembership.role,
        })
        .from(organisationMembership)
        .where(eq(organisationMembership.userId, userId)),
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerified,
      name: row.name ?? null,
      image: row.image ?? null,
      role: row.role as Role,
      locale: row.locale ?? 'en',
      deactivatedAt: row.deactivatedAt ? new Date(row.deactivatedAt).toISOString() : null,
      memberships: memberships.map((m) => ({
        organisationId: m.organisationId,
        role: m.role as MembershipRole,
      })),
    };
  }
}
