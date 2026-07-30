import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useAdminFeatureFlagsQuery,
  useUpdateFeatureFlagMutation,
} from '@/entities/feature-flag';
import { Button } from '@/shared/ui';

/**
 * Sysadmin-only admin page for toggling feature flags. Each row in
 * `useAdminFeatureFlagsQuery` becomes a table row with a toggle button that
 * patches the flag via `useUpdateFeatureFlagMutation`. The "last updated"
 * cell shows the user id plus a locale-formatted timestamp so date-fns is
 * not required.
 *
 * i18n keys live under `admin.featureFlags.*`. They are seeded in Task 11;
 * before then the keys render as their raw paths, which is acceptable for
 * a sysadmin-only surface.
 *
 * The "last updated" cell shows the updater's name (or email if the name
 * is null — some users signed up without a name) plus a locale-formatted
 * timestamp. Raw UUIDs never surface.
 */
export function AdminFeatureFlagsPage(): React.ReactElement {
  const { t } = useTranslation();
  const { data: rows = [], isLoading } = useAdminFeatureFlagsQuery();
  const updateMut = useUpdateFeatureFlagMutation();

  if (isLoading) {
    return <p className="container py-8">{t('common.loading')}</p>;
  }

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('admin.featureFlags.title')}
      </h1>
      <table className="mt-6 w-full">
        <thead>
          <tr className="text-left text-sm text-on-surface-variant">
            <th className="py-2">{t('admin.featureFlags.code')}</th>
            <th className="py-2">{t('admin.featureFlags.enabled')}</th>
            <th className="py-2">{t('admin.featureFlags.lastUpdated')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-t border-outline-variant">
              <td className="py-3 font-mono text-sm">{row.code}</td>
              <td className="py-3">
                <Button
                  size="sm"
                  variant={row.enabled ? 'default' : 'outline'}
                  onClick={() =>
                    updateMut.mutate({
                      code: row.code,
                      input: { enabled: !row.enabled },
                    })
                  }
                  disabled={updateMut.isPending}
                  aria-pressed={row.enabled}
                >
                  {row.enabled
                    ? t('admin.featureFlags.on')
                    : t('admin.featureFlags.off')}
                </Button>
              </td>
              <td className="py-3 text-sm text-on-surface-variant">
                {row.updatedBy
                  ? `${row.updatedBy.name ?? row.updatedBy.email} · ${new Date(row.updatedAt).toLocaleString()}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
