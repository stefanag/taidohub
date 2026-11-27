import { createRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { publicLayoutRoute } from './_public.js';

import { VerifyEmailPage } from '@/pages/verify-email';

interface VerifyEmailSearch {
  error?: string | undefined;
}

const SearchSchema = z.object({ error: z.string().optional() });

/** better-auth redirects here after a confirmation link, with `?error=` when it failed. */
export const verifyEmailRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/verify-email',
  validateSearch: (raw: Record<string, unknown>): VerifyEmailSearch => SearchSchema.parse(raw),
  component: VerifyEmailRouteComponent,
});

function VerifyEmailRouteComponent() {
  const { error } = verifyEmailRoute.useSearch();
  return <VerifyEmailPage error={error} />;
}

export const Route = verifyEmailRoute;
