import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { setInitialPassword } from '@/entities/user';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';

export interface SetPasswordFormProps {
  /** One-time token from the `?token=` query parameter. */
  token: string;
}

/**
 * Public form for choosing a password from an invite or reset link. Validates
 * the match + minimum length client-side, then posts to the public
 * set-initial-password endpoint. On success it does a full-page navigation to
 * `/dashboard` so the freshly issued session cookie is picked up.
 */
export function SetPasswordForm({ token }: SetPasswordFormProps): React.ReactElement {
  const { t } = useTranslation();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(undefined);

    if (password.length < 8) {
      setError(t('zod.tooSmall', { defaultValue: 'Must be at least {{min}}.', min: 8 }));
      return;
    }
    if (password !== confirm) {
      setError(
        t('auth.setPassword.mismatch', { defaultValue: 'The passwords do not match.' }),
      );
      return;
    }

    setSubmitting(true);
    try {
      await setInitialPassword({ token, password });
      // Full navigation so the new session cookie is applied to the next load.
      window.location.assign('/dashboard');
    } catch (err) {
      if (err instanceof HttpError && err.payload.code === 'INVALID_TOKEN') {
        setError(
          t('auth.setPassword.invalidToken', {
            defaultValue:
              'This link is invalid or has expired. Ask an administrator to send a new one.',
          }),
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('common.unknownError', { defaultValue: 'Unknown error' }));
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="set-password">
          {t('auth.setPassword.passwordLabel', { defaultValue: 'Password' })}
        </Label>
        <Input
          id="set-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>

      <FormField>
        <Label htmlFor="set-password-confirm">
          {t('auth.setPassword.confirmLabel', { defaultValue: 'Confirm password' })}
        </Label>
        <Input
          id="set-password-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </FormField>

      <FormMessage message={error} />

      <Button type="submit" disabled={submitting} className="w-full">
        {t('auth.setPassword.submit', { defaultValue: 'Set password' })}
      </Button>
    </form>
  );
}
