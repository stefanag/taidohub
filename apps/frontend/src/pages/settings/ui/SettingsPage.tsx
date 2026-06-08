import { Link } from '@tanstack/react-router';
import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Settings hub. Lists the available settings sections. As more sections
 * ship, append more `<SectionLink>`s here.
 */
export function SettingsPage(): React.ReactElement {
  const { t } = useTranslation();

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
      </ul>
    </main>
  );
}
