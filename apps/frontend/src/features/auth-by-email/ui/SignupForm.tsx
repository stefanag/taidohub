import * as React from 'react';

import { SignUpWithEmailSchema } from '@repo/contracts/auth';

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Label,
  useZodForm,
} from '@/shared/ui';

import { signUpWithEmail } from '../api/auth.api.js';

export interface SignupFormProps {
  onSuccess?: () => void;
}

export function SignupForm({ onSuccess }: SignupFormProps): React.ReactElement {
  const form = useZodForm(SignUpWithEmailSchema, {
    email: '',
    password: '',
    name: '',
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);
    const result = form.validate();
    if (!result.ok) return;
    setSubmitting(true);
    try {
      await signUpWithEmail(result.data);
      onSuccess?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="signup-name">Name</Label>
        <Input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          value={String(form.values.name ?? '')}
          onChange={form.onChange('name')}
          aria-invalid={Boolean(form.errors.name)}
        />
        <FormMessage message={form.errors.name} />
      </FormField>

      <FormField>
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
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
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={String(form.values.password ?? '')}
          onChange={form.onChange('password')}
          aria-invalid={Boolean(form.errors.password)}
        />
        <FormMessage message={form.errors.password} />
      </FormField>

      <FormMessage message={submitError} />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
