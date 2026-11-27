import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { registerWithGoogle, signInProvidersQueryOptions } from '@/features/auth-by-email';
import { RegisterForm } from '@/features/register-account';
import { useFeatureFlag } from '@/shared/lib/feature-flags';

/** Public page for creating an account without a club. Behind the `self-registration` flag. */
export function RegisterPage(): React.ReactElement {
  const { t } = useTranslation();
  const open = useFeatureFlag('self-registration');
  const providers = useQuery(signInProvidersQueryOptions());
  // better-auth sends a failed Google sign-up back here with ?error=.
  const googleError = new URLSearchParams(window.location.search).get('error');
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-surface p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t('register.title')}</h1>
          <p className="text-sm text-on-surface-variant">{t('register.description')}</p>
        </div>
        {googleError ? (
          <p role="alert" className="text-sm">
            {t('register.googleFailed')}
          </p>
        ) : null}
        {open ? (
          <RegisterForm onRegisterWithGoogle={providers.data?.google ? registerWithGoogle : undefined} />
        ) : (
          <p className="text-sm">{t('register.closed')}</p>
        )}
        <p className="text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">
            {t('register.haveAccount')}
          </Link>
        </p>
      </div>
    </main>
  );
}
