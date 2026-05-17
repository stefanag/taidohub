import { ForbiddenException, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@casl/ability';
import type {
  AuditLogAction,
  AuditLogEntry,
  ListAuditLogQuery,
  ListAuditLogResponse,
} from '@repo/contracts/audit-log';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DrizzleDb } from '../../infrastructure/database/client.js';
import { type DbAuditLog } from '../../infrastructure/database/schema/index.js';

import { AuditLogRepository } from './audit-log.repository.js';

export interface RecordInput {
  tx: DrizzleDb;
  entityType: string;
  entityId: string;
  action: AuditLogAction;
  userId: string | null;
  before: unknown | null;
  after: unknown | null;
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly repo: AuditLogRepository,
    private readonly abilities: AbilityFactory,
  ) {}

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

  async list(query: ListAuditLogQuery, user: AuthenticatedUser | null): Promise<ListAuditLogResponse> {
    this.assertCan(user, 'read');
    const { data, total } = await this.repo.list(query);
    return { data: data.map((r) => this.toApi(r)), total, page: query.page, perPage: query.perPage };
  }

  private assertCan(user: AuthenticatedUser | null, action: 'read'): void {
    const ability = this.abilities.createForUser(user);
    try {
      ForbiddenError.from(ability).throwUnlessCan(action, 'AuditLog');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: err.message } });
      }
      throw err;
    }
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
