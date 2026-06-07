import { useTranslation } from 'react-i18next';

/**
 * Settings landing page. Stub — populated as settings sections are added.
 */
export function SettingsPage(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <main className="container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-on-surface-variant">{t('settings.placeholder')}</p>
      </div>
    </main>
  );
}
