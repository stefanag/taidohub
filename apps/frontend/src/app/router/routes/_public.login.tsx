import { createRoute } from '@tanstack/react-router';

import { publicLayoutRoute } from './_public.js';

import { LoginPage } from '@/pages/login';


export const loginRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/login',
  component: LoginPage,
});

export const Route = loginRoute;
