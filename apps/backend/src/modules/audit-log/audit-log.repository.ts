import { Inject, Injectable } from '@nestjs/common';
import type { ListAuditLogQuery } from '@repo/contracts/audit-log';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { auditLog, type DbAuditLog, type DbNewAuditLog } from '../../infrastructure/database/schema/index.js';

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

  async list(filter: ListAuditLogQuery): Promise<{ data: DbAuditLog[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.entityType) filters.push(eq(auditLog.entityType, filter.entityType));
    if (filter.entityId) filters.push(eq(auditLog.entityId, filter.entityId));
    if (filter.userId) filters.push(eq(auditLog.userId, filter.userId));
    if (filter.action) filters.push(eq(auditLog.action, filter.action));
    if (filter.from) filters.push(gte(auditLog.createdAt, new Date(filter.from)));
    if (filter.to) filters.push(lte(auditLog.createdAt, new Date(filter.to)));
    const where = filters.length ? and(...filters) : undefined;

    const offset = (filter.page - 1) * filter.perPage;
    const data = await this.db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(filter.perPage)
      .offset(offset);

    const totalRows = await this.db.select({ value: count() }).from(auditLog).where(where);
    return { data, total: Number(totalRows[0]?.value ?? 0) };
  }
}
