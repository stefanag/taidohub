import { createRoute } from '@tanstack/react-router';

import { LoginPage } from '@/pages/login';

import { rootRoute } from './__root.js';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

export const Route = loginRoute;
