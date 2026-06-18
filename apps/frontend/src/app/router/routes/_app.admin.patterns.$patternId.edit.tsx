import { createRoute } from '@tanstack/react-router';

import { adminPatternsRoute } from './_app.admin.patterns.js';

import { AdminPatternEditPage } from '@/pages/admin/patterns/edit';

export const adminPatternEditRoute = createRoute({
  getParentRoute: () => adminPatternsRoute,
  path: '/$patternId/edit',
  component: AdminPatternEditPage,
});

export const Route = adminPatternEditRoute;
