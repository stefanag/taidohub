import { SignInWithEmailSchema } from '@repo/contracts/auth';
import * as React from 'react';
import { useTranslation } from 'react-i18next';


import { signInWithEmail } from '../api/auth.api.js';

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Label,
  useZodForm,
} from '@/shared/ui';


export interface LoginFormProps {
  /**
   * Called after a successful sign-in. `redirectTo` is set when the sign-in
   * resumed an OAuth authorization and the browser should leave the app.
   */
  onSuccess?: (redirectTo?: string) => void;
}

/**
 * Email/password login form. Wires native inputs to a tiny Zod-backed
 * `useZodForm` helper (no `react-hook-form` dependency); validation messages
 * come straight from `SignInWithEmailSchema` in `@repo/contracts/auth`.
 */
export function LoginForm({ onSuccess }: LoginFormProps): React.ReactElement {
  const form = useZodForm(SignInWithEmailSchema, { email: '', password: '' });
  const { t } = useTranslation();
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);
    const result = form.validate();
    if (!result.ok) return;
    setSubmitting(true);
    try {
      const redirectTo = await signInWithEmail(result.data);
      onSuccess?.(redirectTo);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('auth.login.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormField>
        <Label
          htmlFor="login-email"
          className='block font-label text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-1.5'>
          {t('auth.login.emailLabel')}
        </Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          value={String(form.values.email ?? '')}
          onChange={form.onChange('email')}
          aria-invalid={Boolean(form.errors.email)}
          variant="cleanauth"
          />
        <FormMessage message={form.errors.email} />
      </FormField>

      <FormField>
        <Label
          htmlFor="login-password"
          className='block font-label text-xs font-medium text-on-surface-variant uppercase tracking-widest mb-1.5'>
          {t('auth.login.passwordLabel')}
        </Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={String(form.values.password ?? '')}
          onChange={form.onChange('password')}
          aria-invalid={Boolean(form.errors.password)}
          variant="cleanauth"
        />
        <FormMessage message={form.errors.password} />
      </FormField>

      <FormMessage message={submitError} />

      <Button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-sm transition-all disabled:opacity-50 outline-hidden font-bold tracking-wide px-5 py-2.5 text-sm bg-primary text-on-primary hover:bg-primary/90 w-full mt-2">
        {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
      </Button>
    </form>
  );
}
