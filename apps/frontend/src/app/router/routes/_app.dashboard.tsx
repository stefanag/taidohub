import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { DashboardPage } from '@/pages/dashboard';


export const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});

export const Route = dashboardRoute;
