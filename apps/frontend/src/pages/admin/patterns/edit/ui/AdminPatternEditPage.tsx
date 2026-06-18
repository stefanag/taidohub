import { useNavigate, useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { usePatternQuery } from '@/entities/pattern';
import { PatternForm } from '@/features/pattern-form';

/**
 * Sysadmin-only "edit pattern" page. Loads the row by id and wraps
 * `PatternForm` with it preloaded. On save → navigate to view; on cancel
 * → navigate to view (the user came from the view page; sending them
 * back there is the least-surprising outcome).
 */
export function AdminPatternEditPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { patternId } = useParams({
    from: '/_app/admin/patterns/$patternId/edit',
  });
  const patternQuery = usePatternQuery(patternId);

  const toView = (): void => {
    void navigate({
      to: '/admin/patterns/$patternId',
      params: { patternId },
    });
  };

  return (
    <main className="container max-w-3xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('patterns.form.title', { defaultValue: 'Edit pattern' })}
      </h1>
      <div className="mt-6">
        {patternQuery.isPending ? (
          <p className="text-on-surface-variant">
            {t('common.loading', { defaultValue: 'Loading…' })}
          </p>
        ) : patternQuery.data ? (
          <PatternForm
            pattern={patternQuery.data}
            onSaved={toView}
            onCancel={toView}
          />
        ) : (
          <p className="text-on-surface-variant">
            {t('admin.patterns.notFound', {
              defaultValue: 'Pattern not found.',
            })}
          </p>
        )}
      </div>
    </main>
  );
}
