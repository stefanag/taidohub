import { createRoute } from '@tanstack/react-router';

import { publicLayoutRoute } from './_public.js';

import { RegisterPage } from '@/pages/register';

export const registerRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/register',
  component: RegisterPage,
});

export const Route = registerRoute;
