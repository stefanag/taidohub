import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { requestPasswordReset } from '../api/auth.api.js';

import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';

/**
 * Asks for a password-reset link. The confirmation is the same whether or not
 * the address has an account, so the form cannot be used to find out who is
 * registered.
 */
export function ForgotPasswordForm(): React.ReactElement {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState('');
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(t('auth.forgotPassword.invalidEmail'));
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
    } catch {
      setError(t('auth.forgotPassword.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <p role="status" className="text-sm">
        {t('auth.forgotPassword.sent', { email: sentTo })}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="forgot-email">{t('auth.login.emailLabel')}</Label>
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </FormField>
      <FormMessage message={error} />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
      </Button>
    </form>
  );
}
