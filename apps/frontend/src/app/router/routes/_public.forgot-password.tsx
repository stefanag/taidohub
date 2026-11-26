import { createRoute } from '@tanstack/react-router';

import { publicLayoutRoute } from './_public.js';

import { ForgotPasswordPage } from '@/pages/forgot-password';

/** Public `/forgot-password`: ask for a password-reset email. */
export const forgotPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

export const Route = forgotPasswordRoute;
