import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { InvalidResetTokenError, resetPassword } from '../api/auth.api.js';

import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';

export interface ResetPasswordFormProps {
  /** Token from the reset link's `?token=` parameter. */
  token: string;
  /** Called after the password has been changed. */
  onDone: () => void;
  /** Called when the link has expired or been used, to offer a new one. */
  onInvalidToken: () => void;
}

/** Choose a new password from a self-service reset link. */
export function ResetPasswordForm({
  token,
  onDone,
  onInvalidToken,
}: ResetPasswordFormProps): React.ReactElement {
  const { t } = useTranslation();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    if (password.length < 8) {
      setError(t('zod.tooSmall', { min: 8 }));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.setPassword.mismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      onDone();
    } catch (err) {
      if (err instanceof InvalidResetTokenError) {
        onInvalidToken();
        return;
      }
      setError(t('auth.resetPassword.failed'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="reset-password">{t('auth.setPassword.passwordLabel')}</Label>
        <Input
          id="reset-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>
      <FormField>
        <Label htmlFor="reset-password-confirm">{t('auth.setPassword.confirmLabel')}</Label>
        <Input
          id="reset-password-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>
      <FormMessage message={error} />
      <Button type="submit" disabled={submitting} className="w-full">
        {t('auth.resetPassword.submit')}
      </Button>
    </form>
  );
}
