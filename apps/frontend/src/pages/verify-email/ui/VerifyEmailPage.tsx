import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { resendVerificationEmail } from '@/features/auth-by-email';
import { Button, FormField, Input, Label } from '@/shared/ui';

export interface VerifyEmailPageProps {
  /** better-auth's error code when the link was invalid or expired. */
  error?: string | undefined;
}

/**
 * Where the confirmation link lands. On success better-auth has already
 * confirmed the address and signed the user in; on failure the user can ask
 * for a new link.
 */
export function VerifyEmailPage({ error }: VerifyEmailPageProps): React.ReactElement {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-surface p-8 shadow-sm text-center">
        {error ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('verifyEmail.failedTitle')}
            </h1>
            <p role="alert" className="text-sm">
              {t('verifyEmail.failed')}
            </p>
            {sent ? (
              <p role="status" className="text-sm">
                {t('auth.login.verificationResent')}
              </p>
            ) : (
              <form
                className="space-y-3 text-left"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim())
                    void resendVerificationEmail(email.trim()).then(() => setSent(true));
                }}
              >
                <FormField>
                  <Label htmlFor="verify-email-address">{t('register.email')}</Label>
                  <Input
                    id="verify-email-address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </FormField>
                <Button type="submit" className="w-full">
                  {t('auth.login.resendVerification')}
                </Button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">{t('verifyEmail.doneTitle')}</h1>
            <p role="status" className="text-sm">
              {t('verifyEmail.done')}
            </p>
            <Link to="/dashboard" className="text-primary hover:underline">
              {t('verifyEmail.continue')}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
