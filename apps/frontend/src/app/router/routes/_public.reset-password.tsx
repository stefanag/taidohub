import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { publicLayoutRoute } from './_public.js';

import { ResetPasswordPage } from '@/pages/reset-password';

/** better-auth redirects here from the emailed reset link. */
const ResetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

interface ResetPasswordSearch {
  token?: string | undefined;
  error?: string | undefined;
}

export const resetPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/reset-password',
  validateSearch: (raw: Record<string, unknown>): ResetPasswordSearch =>
    ResetPasswordSearchSchema.parse(raw),
  component: ResetPasswordRouteComponent,
});

/** Reads the validated search params and hands them to the page as props. */
function ResetPasswordRouteComponent() {
  const { token, error } = resetPasswordRoute.useSearch();
  return <ResetPasswordPage token={token} error={error} />;
}

export const Route = resetPasswordRoute;
