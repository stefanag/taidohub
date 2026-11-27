import { useTranslation } from 'react-i18next';

import { useMyMembershipsQuery } from '@/entities/me';
import { NextRankCard } from '@/features/next-rank-card';

/**
 * Dashboard landing page. Skeleton — real content lands later.
 *
 * Users without any club membership (typically self-registered) get a short
 * note that their gradings are self-reported until a club verifies them.
 */
export function DashboardPage(): React.ReactElement {
  const { t } = useTranslation();
  const memberships = useMyMembershipsQuery();
  const withoutClub = memberships.isSuccess && memberships.data.length === 0;

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
      </div>

      {withoutClub ? (
        <p role="note" className="mb-6 rounded-md bg-tertiary-container p-3 text-sm text-on-tertiary-container">
          {t('dashboard.withoutClub')}
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <NextRankCard />
      </div>
    </main>
  );
}
