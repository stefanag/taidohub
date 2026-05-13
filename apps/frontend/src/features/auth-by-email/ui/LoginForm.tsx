import * as React from 'react';

import { SignInWithEmailSchema } from '@repo/contracts/auth';

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Label,
  useZodForm,
} from '@/shared/ui';

import { signInWithEmail } from '../api/auth.api.js';

export interface LoginFormProps {
  onSuccess?: () => void;
}

/**
 * Email/password login form. Wires native inputs to a tiny Zod-backed
 * `useZodForm` helper (no `react-hook-form` dependency); validation messages
 * come straight from `SignInWithEmailSchema` in `@repo/contracts/auth`.
 */
export function LoginForm({ onSuccess }: LoginFormProps): React.ReactElement {
  const form = useZodForm(SignInWithEmailSchema, { email: '', password: '' });
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);
    const result = form.validate();
    if (!result.ok) return;
    setSubmitting(true);
    try {
      await signInWithEmail(result.data);
      onSuccess?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          value={String(form.values.email ?? '')}
          onChange={form.onChange('email')}
          aria-invalid={Boolean(form.errors.email)}
        />
        <FormMessage message={form.errors.email} />
      </FormField>

      <FormField>
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={String(form.values.password ?? '')}
          onChange={form.onChange('password')}
          aria-invalid={Boolean(form.errors.password)}
        />
        <FormMessage message={form.errors.password} />
      </FormField>

      <FormMessage message={submitError} />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
