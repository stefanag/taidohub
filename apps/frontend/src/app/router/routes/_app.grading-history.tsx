import { createRoute } from '@tanstack/react-router';

import { GradingHistoryPage } from '@/pages/grading-history';

import { appLayoutRoute } from './_app.js';

/**
 * Authenticated `/grading-history` route. Mounts under the existing `_app`
 * layout (so the session check + sidebar shell are inherited).
 */
export const gradingHistoryRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/grading-history',
  component: GradingHistoryPage,
});

export const Route = gradingHistoryRoute;
