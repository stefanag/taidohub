import { Link } from '@tanstack/react-router';
import { Flag, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth-by-email';

/**
 * Settings hub. Lists the available settings sections. As more sections
 * ship, append more `<SectionLink>`s here. The feature-flag card is gated
 * on the sysadmin role; non-sysadmins do not see it.
 */
export function SettingsPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const role = (session.data?.user as { role?: string } | undefined)?.role;
  const isSysadmin = role === 'sysadmin';

  return (
    <main className="container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            to="/settings/labels"
            className="flex items-center gap-3 rounded-lg border border-outline-variant p-4 hover:border-primary hover:bg-surface-container"
          >
            <Tag className="size-5 text-on-surface-variant" aria-hidden />
            <span className="font-medium">{t('settings.labels.title')}</span>
          </Link>
        </li>
        {isSysadmin ? (
          <li>
            <Link
              to="/admin/feature-flags"
              className="flex items-center gap-3 rounded-lg border border-outline-variant p-4 hover:border-primary hover:bg-surface-container"
            >
              <Flag className="size-5 text-on-surface-variant" aria-hidden />
              <span className="font-medium">{t('admin.featureFlags.title')}</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </main>
  );
}
