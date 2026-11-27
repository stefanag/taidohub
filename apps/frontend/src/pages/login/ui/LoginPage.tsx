import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { GoogleSignInButton, LoginForm } from '@/features/auth-by-email';
import { LocaleSwitcher } from '@/features/locale-switcher';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { APP_LANDING_ROUTE } from '@/shared/lib/routes';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

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
  const selfRegistration = useFeatureFlag('self-registration');
  const params = new URLSearchParams(window.location.search);
  // Mid-way through connecting an AI client (OAuth authorize), only the email
  // form resumes that flow, so Google is not offered there.
  const connectingClient = params.has('client_id');
  const googleError = params.get('error');
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
              onSuccess={(redirectTo) => {
                // Signing in to connect an AI client: continue the OAuth flow.
                if (redirectTo) {
                  window.location.assign(redirectTo);
                  return;
                }
                void navigate({ to: APP_LANDING_ROUTE });
              }}
            />
            {googleError ? (
              <p role="alert" className="mt-4 text-sm">
                {googleError === 'signup_disabled'
                  ? t('auth.login.googleUnknownAccount')
                  : googleError === 'account_not_linked'
                    ? t('auth.login.googleNotActivated')
                    : t('auth.login.googleFailed')}
                {googleError === 'signup_disabled' && selfRegistration ? (
                  <>
                    {' '}
                    <Link to="/register" className="text-primary hover:underline">
                      {t('auth.login.createAccount')}
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            {connectingClient ? null : (
              <div className="mt-4">
                <GoogleSignInButton />
              </div>
            )}
            <p className="mt-4 text-center text-sm">
              <Link to="/forgot-password" className="text-primary hover:underline">
                {t('auth.login.forgotPassword')}
              </Link>
            </p>
            {selfRegistration ? (
              <p className="mt-2 text-center text-sm">
                <Link to="/register" className="text-primary hover:underline">
                  {t('auth.login.createAccount')}
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
        <LocaleSwitcher variant="onDark" className="self-start" />
      </div>
    </main>
  );
}
