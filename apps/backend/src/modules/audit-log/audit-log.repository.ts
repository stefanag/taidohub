import { Inject, Injectable } from '@nestjs/common';
import type { ListAuditLogQuery } from '@repo/contracts/audit-log';
import { and, count, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { auditLog, user, type DbAuditLog, type DbNewAuditLog } from '../../infrastructure/database/schema/index.js';

export interface DbAuditLogWithUser extends DbAuditLog {
  user: { id: string; name: string | null; email: string } | null;
}

@Injectable()
export class AuditLogRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Insert one audit row. Accepts a Drizzle transaction so the caller can
   * commit the audit + the mutation atomically. If `tx` is omitted, falls
   * back to the injected `db` (only useful for tests that don't care about
   * transactional consistency).
   */
  async insert(input: DbNewAuditLog, tx?: DrizzleExecutor): Promise<void> {
    await (tx ?? this.db).insert(auditLog).values(input);
  }

  /**
   * @param restrictToOrganisationIds When provided, a non-bypassable security
   *   scope: results are AND-ed with `entity_type = 'organisation'` and
   *   `entity_id IN (...)`. Used to confine an `orgadmin` to the organisations
   *   they administer. Omit for unrestricted (sysadmin) reads.
   *
   * The page LEFT JOINs `user` so the admin table can render the actor's
   * name rather than a raw UUID; the left join preserves rows whose actor
   * was later deleted (FK is `ON DELETE SET NULL`) — those come back with
   * `user: null`.
   */
  async list(
    filter: ListAuditLogQuery,
    restrictToOrganisationIds?: readonly string[],
  ): Promise<{ data: DbAuditLogWithUser[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.entityType) filters.push(eq(auditLog.entityType, filter.entityType));
    if (filter.entityId) filters.push(eq(auditLog.entityId, filter.entityId));
    if (filter.userId) filters.push(eq(auditLog.userId, filter.userId));
    if (filter.action) filters.push(eq(auditLog.action, filter.action));
    if (filter.from) filters.push(gte(auditLog.createdAt, new Date(filter.from)));
    if (filter.to) filters.push(lte(auditLog.createdAt, new Date(filter.to)));
    if (restrictToOrganisationIds && restrictToOrganisationIds.length > 0) {
      filters.push(eq(auditLog.entityType, 'organisation'));
      filters.push(inArray(auditLog.entityId, [...restrictToOrganisationIds]));
    }
    const where = filters.length ? and(...filters) : undefined;

    const offset = (filter.page - 1) * filter.perPage;
    const rows = await this.db
      .select({
        row: auditLog,
        actor: { id: user.id, name: user.name, email: user.email },
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(filter.perPage)
      .offset(offset);

    const totalRows = await this.db.select({ value: count() }).from(auditLog).where(where);
    return {
      data: rows.map((r) => ({ ...r.row, user: r.actor?.id ? r.actor : null })),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }
}
