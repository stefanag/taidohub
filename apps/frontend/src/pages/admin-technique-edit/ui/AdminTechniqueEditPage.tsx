import { useNavigate, useParams } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useTechniqueQuery } from '@/entities/technique';
import { TechniqueForm } from '@/features/technique-form';

/**
 * Sysadmin-only "edit technique" page. Loads the row by id, then wraps
 * `TechniqueForm` with it preloaded. Save and cancel both navigate back to
 * the admin list. While the technique is loading the page shows a stub
 * line; if the id resolves to nothing the page surfaces an inline
 * not-found message rather than rendering an empty form.
 */
export function AdminTechniqueEditPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { techniqueId } = useParams({ from: '/_app/admin/techniques/$techniqueId' });
  const techniqueQuery = useTechniqueQuery(techniqueId);

  const back = (): void => {
    void navigate({ to: '/admin/techniques' });
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
            onSaved={back}
            onCancel={back}
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
