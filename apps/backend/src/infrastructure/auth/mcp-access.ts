import { and, eq, isNull } from 'drizzle-orm';

import { type Env } from '../../config/env.schema.js';
import { type DrizzleDb } from '../database/client.js';
import { organisationMembership, user as userTable } from '../database/schema/index.js';

/**
 * The MCP protected-resource identifier for this deployment: the API's own
 * origin plus `/api/mcp`, e.g. `https://taidohub.se/api/mcp`. Access tokens
 * issued to AI clients are audience-bound to it. `BETTER_AUTH_URL` is the
 * public origin of the app (one origin per environment), so the identifier
 * follows the environment without a separate setting.
 */
export function mcpResource(env: Pick<Env, 'BETTER_AUTH_URL'>): string {
  return new URL('/api/mcp', env.BETTER_AUTH_URL).toString();
}

/**
 * Who may connect an AI client (authorize an OAuth client for the MCP
 * resource): active sysadmins, and active users who are orgadmin of at least
 * one organisation. Instructors and students may not, in the first version.
 *
 * This only gates the OAuth grant. Every MCP request is authorised again by
 * CASL with the caller's ability, so an orgadmin's tools still see only their
 * own organisations.
 *
 * Lives in infrastructure/auth next to AuthGuard, which reads the same rows
 * for the same reason: it runs inside better-auth's hooks, before any Nest
 * request context or service exists.
 */
export async function canConnectMcpClient(db: DrizzleDb, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(and(eq(userTable.id, userId), isNull(userTable.deactivatedAt)))
    .limit(1);
  if (!row) return false;
  if (row.role === 'sysadmin') return true;

  const [membership] = await db
    .select({ organisationId: organisationMembership.organisationId })
    .from(organisationMembership)
    .where(
      and(eq(organisationMembership.userId, userId), eq(organisationMembership.role, 'orgadmin')),
    )
    .limit(1);
  return membership !== undefined;
}
