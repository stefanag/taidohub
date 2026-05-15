import { createRoute } from '@tanstack/react-router';

import { DashboardPage } from '@/pages/dashboard';

import { appLayoutRoute } from './_app.js';

export const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});

export const Route = dashboardRoute;
