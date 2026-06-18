import { createRoute } from '@tanstack/react-router';

import { adminPatternsRoute } from './_app.admin.patterns.js';

import { AdminPatternNewPage } from '@/pages/admin/patterns/new';

export const adminPatternNewRoute = createRoute({
  getParentRoute: () => adminPatternsRoute,
  path: '/new',
  component: AdminPatternNewPage,
});

export const Route = adminPatternNewRoute;
