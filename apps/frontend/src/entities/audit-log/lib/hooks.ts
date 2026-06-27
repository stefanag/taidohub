import { queryOptions } from '@tanstack/react-query';

import type { ListAuditLogQuery } from '@repo/contracts/audit-log';

import { listAuditLog } from '../api/audit-log.api.js';

export const auditLogKeys = {
  all: ['audit-log'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (query: ListAuditLogQuery) => [...auditLogKeys.lists(), query] as const,
};

export function listAuditLogQueryOptions(query: ListAuditLogQuery) {
  return queryOptions({
    queryKey: auditLogKeys.list(query),
    queryFn: () => listAuditLog(query),
  });
}
