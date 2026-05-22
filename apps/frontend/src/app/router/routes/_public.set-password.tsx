import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { SetPasswordPage } from '@/pages/set-password';

import { publicLayoutRoute } from './_public.js';

/** `?token=` is required — an absent/empty token fails validation. */
const SetPasswordSearchSchema = z.object({
  token: z.string().min(1),
});

export const setPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/set-password',
  validateSearch: (raw: Record<string, unknown>) => SetPasswordSearchSchema.parse(raw),
  component: SetPasswordRouteComponent,
});

/**
 * Thin route component: reads the validated `token` search param and passes it
 * to the page as a prop. Keeping the `useSearch` call in this `app`-layer file
 * means `SetPasswordPage` (a `pages` slice) never imports from `app` — which
 * Steiger's `fsd/forbidden-imports` rule rejects.
 */
function SetPasswordRouteComponent() {
  const { token } = setPasswordRoute.useSearch();
  return <SetPasswordPage token={token} />;
}

export const Route = setPasswordRoute;
