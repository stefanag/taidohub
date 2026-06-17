import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { TechniqueForm } from '@/features/technique-form';

/**
 * Sysadmin-only "new technique" page. Wraps `TechniqueForm` in create mode;
 * save and cancel both navigate back to the admin list. The route guard
 * (sysadmin) is enforced on the route definition.
 */
export function AdminTechniqueNewPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = (): void => {
    void navigate({ to: '/admin/techniques' });
  };

  return (
    <main className="container max-w-3xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('techniques.form.newTitle', { defaultValue: 'New technique' })}
      </h1>
      <div className="mt-6">
        <TechniqueForm onSaved={back} onCancel={back} />
      </div>
    </main>
  );
}
