import { useTranslation } from 'react-i18next';

/**
 * Dashboard landing page. Skeleton — real content lands later.
 */
export function DashboardPage(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
      </div>
    </main>
  );
}
