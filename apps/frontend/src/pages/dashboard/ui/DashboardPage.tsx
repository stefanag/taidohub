import { useTranslation } from 'react-i18next';

import { NextRankCard } from '@/features/next-rank-card';

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

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <NextRankCard />
      </div>
    </main>
  );
}
