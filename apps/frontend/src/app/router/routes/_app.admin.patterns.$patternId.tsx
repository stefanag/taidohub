import { createRoute } from '@tanstack/react-router';

import { adminPatternsRoute } from './_app.admin.patterns.js';

import { AdminPatternViewPage } from '@/pages/admin/patterns/view';

export const adminPatternViewRoute = createRoute({
  getParentRoute: () => adminPatternsRoute,
  path: '/$patternId',
  component: AdminPatternViewPage,
});

export const Route = adminPatternViewRoute;
