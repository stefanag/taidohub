import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';
import { LocaleSwitcher } from '@/features/locale-switcher';

/**
 * Public-facing top navigation bar. Only rendered inside the `_public`
 * layout; authenticated users live in the `_app` shell where the sidebar
 * footer carries the locale switcher and sign-out. This component therefore
 * only handles the anonymous case.
 */
export function Header(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <header className="border-b border-border bg-background">
      <div className="container flex h-14 items-center justify-between">
        <nav className="flex items-center gap-4">
          <Link to="/" className="text-sm font-semibold">
            taidohub
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Button asChild variant="outline" size="sm">
            <Link to="/login">{t('header.signIn')}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
