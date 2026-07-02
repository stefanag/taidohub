import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { ProgressionPage } from '@/pages/progression';

/**
 * Authenticated `/progression` route. Mounts under the existing `_app`
 * layout (so the session check + sidebar shell are inherited). Student-
 * facing only — no CASL gate beyond the parent's auth check.
 */
export const progressionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/progression',
  component: ProgressionPage,
});

export const Route = progressionRoute;
