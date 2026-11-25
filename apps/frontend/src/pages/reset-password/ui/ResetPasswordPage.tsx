import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ResetPasswordForm } from '@/features/auth-by-email';

export interface ResetPasswordPageProps {
  /** `?token=` from the link better-auth redirects to. */
  token?: string | undefined;
  /** `?error=` (e.g. `INVALID_TOKEN`) when the link has expired or been used. */
  error?: string | undefined;
}

type View = 'form' | 'done' | 'invalid';

/**
 * Where a self-service reset link lands. better-auth checks the emailed link
 * and redirects here with `?token=`, or with `?error=INVALID_TOKEN` if it has
 * expired or been used.
 */
export function ResetPasswordPage({ token, error }: ResetPasswordPageProps): React.ReactElement {
  const { t } = useTranslation();
  const [view, setView] = React.useState<View>(token && !error ? 'form' : 'invalid');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-surface p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          {t('auth.resetPassword.title')}
        </h1>

        {view === 'form' && token ? (
          <>
            <p className="text-center text-sm text-on-surface-variant">
              {t('auth.resetPassword.description')}
            </p>
            <ResetPasswordForm
              token={token}
              onDone={() => setView('done')}
              onInvalidToken={() => setView('invalid')}
            />
          </>
        ) : null}

        {view === 'done' ? (
          <div className="space-y-4 text-center">
            <p role="status" className="text-sm">
              {t('auth.resetPassword.done')}
            </p>
            <Link to="/login" className="text-sm text-primary hover:underline">
              {t('auth.resetPassword.toLogin')}
            </Link>
          </div>
        ) : null}

        {view === 'invalid' ? (
          <div className="space-y-4 text-center">
            <p role="alert" className="text-sm text-error">
              {t('auth.resetPassword.invalidLink')}
            </p>
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              {t('auth.resetPassword.requestNew')}
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
