import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { LoginForm } from '@/features/auth-by-email';
import { APP_LANDING_ROUTE } from '@/shared/lib/routes';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';
import { LocaleSwitcher } from '@/features/locale-switcher';

/**
 * Sign-in page. Wraps the `LoginForm` feature in a centered Card and
 * navigates to `APP_LANDING_ROUTE` (currently `/dashboard`) on a successful
 * sign-in. The route definition in `app/router/routes/_public.login.tsx`
 * delegates to this component — keep page structure here and routing
 * concerns there.
 */
export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <main className="min-h-screen flex">
      {/* Left hero panel */}
      <div className="hidden lg:flex w-1/2 taido-gradient flex-col justify-between p-16">
        <div>
          <h1 className="font-headline font-extrabold text-4xl text-white tracking-tight">TaidoHub</h1>
        </div>
        <div>
          <p className="japanese-text text-6xl font-bold text-secondary leading-tight mb-6">
            精神一到<br />何事か成らざらん
          </p>
          <p className="text-secondary text-m italic">{t('auth.motto')}</p>
        </div>
        <p className="text-inverse-primary text-xs">© {new Date().getFullYear()} TaidoHub</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface">

        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-headline font-extrabold text-3xl tracking-tight text-on-surface">{t('auth.login.title')}</CardTitle>
            <CardDescription className="text-sm text-on-surface-variant mt-2">
              {t('auth.login.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm
              onSuccess={() => {
                void navigate({ to: APP_LANDING_ROUTE });
              }}
            />
          </CardContent>
        </Card>
        <LocaleSwitcher variant="onDark" className="self-start" />
      </div>
    </main>
  );
}
