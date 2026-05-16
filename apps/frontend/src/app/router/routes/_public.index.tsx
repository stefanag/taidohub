import { createRoute, Link, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/features/auth-by-email';
import { Button } from '@/shared/ui';

import { publicLayoutRoute } from './_public.js';

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
          <Link to="/login">{t('header.signIn')}</Link>
        </Button>
      </div>
    </main>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/',
  beforeLoad: async () => {
    let hasSession = false;
    try {
      const result = await authClient.getSession();
      hasSession = Boolean(result.data);
    } catch {
      hasSession = false;
    }
    if (hasSession) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: IndexComponent,
});

export const Route = indexRoute;
