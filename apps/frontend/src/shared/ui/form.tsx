import * as React from 'react';
import type { ZodTypeAny } from 'zod';

import { cn } from '@/shared/lib/utils';

/**
 * Tiny Zod-backed form helpers. Deliberately small — we don't pull in
 * `react-hook-form` to keep the dep tree lean. Pattern:
 *
 *   const { values, errors, onChange, validate } = useZodForm(MySchema, { ... });
 *
 * Components prefer using these primitives directly with native inputs;
 * shadcn `Label` + `Input` carry the visual concerns.
 */
export function useZodForm<S extends ZodTypeAny>(
  schema: S,
  initial: Partial<Record<keyof S['_input'], unknown>> = {},
) {
  const [values, setValues] = React.useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});

  const setField = React.useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const onChange = React.useCallback(
    (name: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setField(name, value);
    },
    [setField],
  );

  const validate = React.useCallback(():
    | { ok: true; data: S['_output'] }
    | { ok: false; errors: Record<string, string> } => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return { ok: true, data: result.data };
    }
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_root';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    setErrors(fieldErrors);
    return { ok: false, errors: fieldErrors };
  }, [schema, values]);

  return { values, errors, setField, onChange, validate, setErrors };
}

export const FormField = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('space-y-2', className)} {...props} />
));
FormField.displayName = 'FormField';

export interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  message?: string | undefined;
}

export const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, message, children, ...props }, ref) => {
    const body = message ?? children;
    if (!body) return null;
    return (
      <p
        ref={ref}
        className={cn('text-sm font-medium text-destructive', className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';
