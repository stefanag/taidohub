import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { GradingHistoryPage } from '@/pages/grading-history';


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
