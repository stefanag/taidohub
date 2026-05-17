import {
  ListAuditLogResponseSchema,
  type ListAuditLogQuery,
  type ListAuditLogResponse,
} from '@repo/contracts/audit-log';
import { AuditLogRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

export async function listAuditLog(query: ListAuditLogQuery): Promise<ListAuditLogResponse> {
  const raw = await httpClient(AuditLogRoutes.base, {
    query: {
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      action: query.action,
      from: query.from,
      to: query.to,
      page: query.page,
      perPage: query.perPage,
    },
  });
  return ListAuditLogResponseSchema.parse(raw);
}
