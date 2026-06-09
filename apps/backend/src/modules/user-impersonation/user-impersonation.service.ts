import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { type Auth, BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { user as userTable } from '../../infrastructure/database/schema/users.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

/**
 * Wraps better-auth's admin-plugin impersonation endpoints.
 *
 * The two methods deliberately preserve a fixed validation order in `start`:
 * caller-role check → target lookup → target-role check → better-auth call →
 * audit emission. Reordering would either leak target-existence info to
 * non-sysadmins or emit audit rows for rejected attempts.
 *
 * Audit rows use the existing `'create'` / `'delete'` action values rather
 * than introducing `'start'` / `'stop'` — adding enum members would ripple
 * through the contracts package + frontend + DB CHECK constraint and is
 * deferred to Phase B per the impersonation design spec.
 *
 * `userId` on the audit row is the REAL sysadmin's id in both directions:
 * - start: `actingUser` is the sysadmin issuing the request.
 * - stop:  `actingUser.impersonatedBy` carries the real sysadmin id (the
 *   current session belongs to the impersonated target).
 *
 * `impersonatedById` is intentionally `null` for these meta-events: a
 * start/stop is the sysadmin's own action against the impersonation
 * subsystem, not an action performed "during" impersonation. Audit
 * analytics that filter `impersonatedById IS NOT NULL` should not surface
 * these rows.
 */
@Injectable()
export class UserImpersonationService {
  constructor(
    @Inject(BETTER_AUTH) private readonly auth: Auth,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly audit: AuditLogService,
  ) {}

  async start(
    actingUser: AuthenticatedUser,
    targetUserId: string,
    headers: Headers,
  ): Promise<Response> {
    if (actingUser.role !== 'sysadmin') {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Only sysadmins may impersonate.' },
      });
    }

    const [target] = await this.db
      .select({ id: userTable.id, role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, targetUserId))
      .limit(1);

    if (!target) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      });
    }

    if (target.role === 'sysadmin') {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Cannot impersonate another sysadmin.' },
      });
    }

    const response = await this.auth.api.impersonateUser({
      body: { userId: targetUserId },
      headers,
      asResponse: true,
    });

    await this.db.transaction(async (tx) => {
      await this.audit.record({
        tx,
        entityType: 'user_impersonation',
        entityId: targetUserId,
        action: 'create',
        userId: actingUser.id,
        impersonatedById: null,
        before: null,
        after: { startedAt: new Date().toISOString() },
      });
    });

    return response;
  }

  async stop(actingUser: AuthenticatedUser, headers: Headers): Promise<Response> {
    if (!actingUser.impersonatedBy) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Not currently impersonating.' },
      });
    }
    const realSysadminId = actingUser.impersonatedBy;

    const response = await this.auth.api.stopImpersonating({
      headers,
      asResponse: true,
    });

    await this.db.transaction(async (tx) => {
      await this.audit.record({
        tx,
        entityType: 'user_impersonation',
        entityId: actingUser.id,
        action: 'delete',
        userId: realSysadminId,
        impersonatedById: null,
        before: null,
        after: { stoppedAt: new Date().toISOString() },
      });
    });

    return response;
  }
}
