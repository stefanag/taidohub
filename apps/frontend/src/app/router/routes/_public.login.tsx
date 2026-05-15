import { createRoute } from '@tanstack/react-router';

import { LoginPage } from '@/pages/login';

import { publicLayoutRoute } from './_public.js';

export const loginRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/login',
  component: LoginPage,
});

export const Route = loginRoute;
