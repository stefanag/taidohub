import { useNavigate, useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useTechniqueQuery } from '@/entities/technique';
import { TechniqueForm } from '@/features/technique-form';

/**
 * Sysadmin-only "edit technique" page. Loads the row by id and wraps
 * `TechniqueForm` with it preloaded. On save → navigate to view; on
 * cancel → navigate to view (the user came from the view page; sending
 * them back there is the least-surprising outcome).
 */
export function AdminTechniqueEditPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { techniqueId } = useParams({
    from: '/_app/admin/techniques/$techniqueId/edit',
  });
  const techniqueQuery = useTechniqueQuery(techniqueId);

  const toView = (): void => {
    void navigate({
      to: '/admin/techniques/$techniqueId',
      params: { techniqueId },
    });
  };

  return (
    <main className="container max-w-3xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('techniques.form.title', { defaultValue: 'Edit technique' })}
      </h1>
      <div className="mt-6">
        {techniqueQuery.isPending ? (
          <p className="text-on-surface-variant">
            {t('common.loading', { defaultValue: 'Loading…' })}
          </p>
        ) : techniqueQuery.data ? (
          <TechniqueForm
            technique={techniqueQuery.data}
            onSaved={toView}
            onCancel={toView}
          />
        ) : (
          <p className="text-on-surface-variant">
            {t('admin.techniques.notFound', {
              defaultValue: 'Technique not found.',
            })}
          </p>
        )}
      </div>
    </main>
  );
}
