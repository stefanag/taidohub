import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuditLogAction,
  AuditLogEntry,
  ListAuditLogQuery,
  ListAuditLogResponse,
} from '@repo/contracts/audit-log';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { type DbAuditLog } from '../../infrastructure/database/schema/index.js';

import { AuditLogRepository } from './audit-log.repository.js';

export interface RecordInput {
  tx: DrizzleExecutor;
  entityType: string;
  entityId: string;
  action: AuditLogAction;
  userId: string | null;
  before: unknown | null;
  after: unknown | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly repo: AuditLogRepository) {}

  async record(input: RecordInput): Promise<void> {
    await this.repo.insert(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        userId: input.userId,
        // jsonb columns accept any serializable value; we pass through whatever
        // the caller hands us — the rest of the contract is documented by the
        // entity-specific Zod schemas.
        before: input.before as unknown,
        after: input.after as unknown,
      },
      input.tx,
    );
  }

  /**
   * List audit-log entries with a non-bypassable security scope:
   * - `sysadmin` → unrestricted.
   * - non-sysadmin with one or more `orgadmin` memberships → restricted to
   *   `organisation` rows for the org-ids they administer (AND-ed on top of
   *   any caller-supplied `query` filters).
   * - everyone else (plain user, instructor-only, anonymous) → forbidden.
   *
   * Branching is explicit rather than CASL-based: `list` returns a collection
   * and CASL conditional rules only evaluate against single instances.
   */
  async list(query: ListAuditLogQuery, user: AuthenticatedUser | null): Promise<ListAuditLogResponse> {
    if (!user) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Audit log access requires sysadmin or an orgadmin membership.' },
      });
    }

    let restrictToOrganisationIds: readonly string[] | undefined;
    if (user.role !== 'sysadmin') {
      const orgIds = user.memberships
        .filter((m) => m.role === 'orgadmin')
        .map((m) => m.organisationId);
      if (orgIds.length === 0) {
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: 'Audit log access requires sysadmin or an orgadmin membership.' },
        });
      }
      restrictToOrganisationIds = orgIds;
    }

    const { data, total } = await this.repo.list(query, restrictToOrganisationIds);
    return { data: data.map((r) => this.toApi(r)), total, page: query.page, perPage: query.perPage };
  }

  private toApi(row: DbAuditLog): AuditLogEntry {
    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action as AuditLogAction,
      userId: row.userId,
      before: row.before,
      after: row.after,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
