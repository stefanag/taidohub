import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { PatternForm } from '@/features/pattern-form';

/**
 * Sysadmin-only "new pattern" page. Wraps `PatternForm` in create mode;
 * save and cancel both navigate back to the admin list. The sysadmin
 * guard is inherited from `_app.admin.patterns.tsx`.
 */
export function AdminPatternNewPage(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = (): void => {
    void navigate({ to: '/admin/patterns' });
  };

  return (
    <main className="container max-w-3xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('patterns.form.newTitle', { defaultValue: 'New pattern' })}
      </h1>
      <div className="mt-6">
        <PatternForm onSaved={back} onCancel={back} />
      </div>
    </main>
  );
}
