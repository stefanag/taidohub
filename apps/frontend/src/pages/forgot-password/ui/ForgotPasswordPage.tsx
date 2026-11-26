import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ForgotPasswordForm } from '@/features/auth-by-email';

/** Public page where a user asks for a password-reset email. */
export function ForgotPasswordPage(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-surface p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgotPassword.title')}</h1>
          <p className="text-sm text-on-surface-variant">{t('auth.forgotPassword.description')}</p>
        </div>
        <ForgotPasswordForm />
        <p className="text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">
            {t('auth.forgotPassword.backToLogin')}
          </Link>
        </p>
      </div>
    </main>
  );
}
