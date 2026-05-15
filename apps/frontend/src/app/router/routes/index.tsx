import { createRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui';

import { rootRoute } from './__root.js';

function IndexComponent(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <main className="container py-16">
      <h1 className="text-4xl font-bold tracking-tight">taidohub</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">
        {t('home.tagline')}
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild>
          <Link to="/posts">{t('common.browse')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/login">{t('header.signIn')}</Link>
        </Button>
      </div>
    </main>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
});

export const Route = indexRoute;
