import { useTranslation } from 'react-i18next';

import { Can } from '@/shared/lib/casl/ability-context';

/**
 * Dashboard landing page. Skeleton — gates an admin-only block behind
 * `<Can I="create" a="Post">` for now; real content lands later.
 */
export function DashboardPage(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <Can I="create" a="Post">
          <div>You can do it!</div>
        </Can>
      </div>
    </main>
  );
}
