import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { ListAuditLogQuery } from '@/entities/audit-log';
import { AuditLogFilters } from '@/widgets/audit-log-filters';
import { AuditLogTable } from '@/widgets/audit-log-table';

export function AdminAuditLogPage(): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState<ListAuditLogQuery>({ page: 1, perPage: 25 });

  return (
    <main className="container py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t('admin.auditLog.title', { defaultValue: 'Audit log' })}
      </h1>
      <div className="mb-6 rounded-md border bg-surface-container/50 p-4">
        <AuditLogFilters value={query} onChange={setQuery} />
      </div>
      <AuditLogTable query={query} />
    </main>
  );
}
